// POST /api/checkout  -> cria o pagamento no Mercado Pago a partir do Payment Brick
// GET  /api/order/:id -> situação do pedido (a página consulta até o Pix ser aprovado)
import { origemPermitida } from "./cors";
import { consultarPagamento, criarPagamento } from "./mercadopago";
import { buscarPedido, garantirCodigo, registrarPagamento, STATUS_PENDENTES } from "./pedidos";
import { agora, emailValido, erro, idAleatorio, ipDe, json, lerJson } from "./util";

// O que a página envia: o que o Payment Brick entrega em onSubmit + e-mail + opt-in
type CorpoCheckout = {
  selectedPaymentMethod?: string; // "bank_transfer" (Pix), "credit_card" ou "debit_card"
  formData?: {
    payment_method_id?: string;
    token?: string;
    issuer_id?: string | number;
    installments?: number;
    payer?: {
      email?: string;
      first_name?: string;
      last_name?: string;
      identification?: { type?: string; number?: string };
    };
  };
  email?: string;
  novidades?: boolean;
};

/** Validade do Pix no formato que o Mercado Pago espera, no horário de Brasília. */
function expiracaoPix(minutos: number): string {
  return new Date(Date.now() + minutos * 60_000 - 3 * 3600_000).toISOString().replace("Z", "-03:00");
}

export async function rotaCheckout(request: Request, env: Env): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_CHECKOUT.limit({ key: ipDe(request) })).success) {
    return erro(429, "muitas_tentativas", "Muitas tentativas seguidas. Espere um minuto e tente de novo.");
  }
  if (!env.MP_ACCESS_TOKEN) return erro(503, "pagamento_nao_configurado", "O pagamento ainda não está ativo.");

  const corpo = await lerJson<CorpoCheckout>(request);
  if (!corpo || typeof corpo !== "object") return erro(400, "dados_invalidos");
  const form = corpo.formData ?? {};
  const email = String(corpo.email ?? form.payer?.email ?? "").trim().toLowerCase();
  if (!emailValido(email)) return erro(400, "email_invalido", "Informe um e-mail válido.");

  const metodo = String(form.payment_method_id ?? "");
  const tipo = String(corpo.selectedPaymentMethod ?? "");
  const ehPix = metodo === "pix";
  const ehCartao = tipo === "credit_card" || tipo === "debit_card";
  if (!ehPix && !ehCartao) return erro(400, "metodo_nao_aceito", "Aceitamos Pix, cartão de crédito e cartão de débito.");
  if (ehCartao && (!form.token || !metodo)) return erro(400, "dados_do_cartao_incompletos");

  // o preço vem sempre do servidor, nunca do navegador
  const preco = Number(env.PRECO);
  const pedidoId = idAleatorio();
  const quando = agora();
  await env.DB.prepare(
    `INSERT INTO pedidos (id, email, novidades, valor, metodo, tipo, status, criado_em, atualizado_em)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'criado', ?7, ?7)`,
  )
    .bind(pedidoId, email, corpo.novidades === true ? 1 : 0, preco, metodo || null, ehPix ? "bank_transfer" : tipo, quando)
    .run();

  const pagador: Record<string, unknown> = { email };
  const documento = form.payer?.identification;
  if (documento?.type && documento?.number) {
    pagador.identification = { type: String(documento.type), number: String(documento.number).replace(/\D/g, "") };
  }
  if (form.payer?.first_name) pagador.first_name = String(form.payer.first_name).slice(0, 60);
  if (form.payer?.last_name) pagador.last_name = String(form.payer.last_name).slice(0, 60);

  const pagamento: Record<string, unknown> = {
    transaction_amount: preco,
    description: "Correnteza - álbum digital (Thales Carvalho & Thayson Azevedo)",
    payment_method_id: metodo,
    external_reference: pedidoId,
    statement_descriptor: "CORRENTEZA",
    metadata: { pedido_id: pedidoId },
    payer: pagador,
  };
  if (ehPix) {
    pagamento.date_of_expiration = expiracaoPix(Number(env.PIX_VALIDADE_MINUTOS) || 30);
  } else {
    pagamento.token = String(form.token);
    pagamento.installments = tipo === "debit_card" ? 1 : Math.min(Math.max(Math.trunc(Number(form.installments) || 1), 1), 3);
    if (form.issuer_id) pagamento.issuer_id = String(form.issuer_id);
  }

  const resultado = await criarPagamento(env, pagamento, pedidoId);
  if (!resultado.ok) {
    console.error(`Mercado Pago não criou o pagamento do pedido ${pedidoId}: ${resultado.status} ${resultado.mensagem}`);
    await env.DB.prepare("UPDATE pedidos SET status = 'erro', status_detalhe = ?2, atualizado_em = ?3 WHERE id = ?1")
      .bind(pedidoId, resultado.mensagem.slice(0, 200), agora())
      .run();
    return erro(resultado.status >= 500 ? 502 : 400, "pagamento_nao_criado", "Não foi possível processar o pagamento. Confira os dados e tente de novo.");
  }

  const pedido = await registrarPagamento(env, (await buscarPedido(env, pedidoId))!, resultado.pagamento);
  const pix = resultado.pagamento.point_of_interaction?.transaction_data;
  return json(
    {
      pedido: pedidoId,
      status: pedido.status,
      status_detalhe: pedido.status_detalhe,
      ...(pedido.status === "approved" && pedido.codigo ? { codigo: pedido.codigo } : {}),
      ...(ehPix && pix
        ? { pix: { copia_e_cola: pix.qr_code, qr_code_base64: pix.qr_code_base64, link: pix.ticket_url, expira_em: resultado.pagamento.date_of_expiration } }
        : {}),
    },
    201,
  );
}

export async function rotaPedido(request: Request, env: Env, id: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) return erro(404, "pedido_nao_encontrado");
  if (!(await env.LIMITE_CONSULTA.limit({ key: ipDe(request) })).success) return erro(429, "muitas_tentativas");
  let pedido = await buscarPedido(env, id);
  if (!pedido) return erro(404, "pedido_nao_encontrado");

  // se o aviso do Mercado Pago ainda não chegou, pergunta direto a ele (no máximo a cada 15 s)
  const pendente = STATUS_PENDENTES.includes(pedido.status);
  if (pendente && pedido.mp_pagamento_id && env.MP_ACCESS_TOKEN && Date.now() - Date.parse(pedido.atualizado_em) > 15_000) {
    try {
      const pagamento = await consultarPagamento(env, pedido.mp_pagamento_id);
      if (pagamento) pedido = await registrarPagamento(env, pedido, pagamento);
    } catch (e) {
      console.error(e);
    }
  }
  if (pedido.status === "approved" && !pedido.codigo) {
    await garantirCodigo(env, pedido.id);
    pedido = (await buscarPedido(env, id))!;
  }
  const aprovado = pedido.status === "approved";
  return json({
    pedido: pedido.id,
    status: pedido.status,
    status_detalhe: pedido.status_detalhe,
    pago: aprovado,
    ...(aprovado && pedido.codigo ? { codigo: pedido.codigo } : {}),
  });
}
