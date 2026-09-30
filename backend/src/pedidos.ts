// Pedidos, confirmação de pagamento e criação dos códigos de acesso.
import { esquecerCodigo } from "./acesso";
import { enviarEmailDeAcesso } from "./email";
import type { PagamentoMP } from "./mercadopago";
import { agora, gerarCodigo } from "./util";

export type Pedido = {
  id: string;
  email: string;
  novidades: number;
  valor: number;
  metodo: string | null;
  tipo: string | null;
  mp_pagamento_id: string | null;
  status: string;
  status_detalhe: string | null;
  codigo: string | null;
  criado_em: string;
  atualizado_em: string;
  pago_em: string | null;
  email_enviado_em: string | null;
};

export const STATUS_PENDENTES = ["pending", "in_process", "authorized"];
const STATUS_QUE_REVOGAM = new Set(["refunded", "charged_back", "cancelled"]);

export function buscarPedido(env: Env, id: string): Promise<Pedido | null> {
  return env.DB.prepare("SELECT * FROM pedidos WHERE id = ?1").bind(id).first<Pedido>();
}

/** Cria um código único e o grava no banco. */
export async function criarCodigo(
  env: Env,
  dados: { pedidoId?: string; email?: string; origem: "compra" | "teste" | "manual"; limite?: number },
): Promise<string> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    try {
      await env.DB.prepare(
        "INSERT INTO codigos (codigo, pedido_id, email, origem, limite_aparelhos, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
        .bind(codigo, dados.pedidoId ?? null, dados.email ?? null, dados.origem, dados.limite ?? null, agora())
        .run();
      return codigo;
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new Error("Não foi possível gerar um código único");
}

/** Atualiza o pedido com a situação atual do pagamento no Mercado Pago. */
export async function registrarPagamento(env: Env, pedido: Pedido, pagamento: PagamentoMP): Promise<Pedido> {
  let status = pagamento.status;
  const preco = Number(env.PRECO);
  const valorErrado = (pagamento.transaction_amount ?? 0) + 0.001 < preco || (pagamento.currency_id ?? "BRL") !== "BRL";
  if (status === "approved" && valorErrado) {
    console.error(`Pagamento ${pagamento.id} aprovado com ${pagamento.transaction_amount} ${pagamento.currency_id}; esperado ${preco} BRL.`);
    status = "valor_divergente";
  }
  await env.DB.prepare(
    `UPDATE pedidos SET status = ?2, status_detalhe = ?3, mp_pagamento_id = ?4,
            metodo = COALESCE(?5, metodo), tipo = COALESCE(?6, tipo), atualizado_em = ?7
      WHERE id = ?1`,
  )
    .bind(pedido.id, status, pagamento.status_detail ?? null, String(pagamento.id), pagamento.payment_method_id ?? null, pagamento.payment_type_id ?? null, agora())
    .run();

  if (status === "approved") {
    await env.DB.prepare("UPDATE pedidos SET pago_em = COALESCE(pago_em, ?2) WHERE id = ?1").bind(pedido.id, agora()).run();
    await garantirCodigo(env, pedido.id);
  } else if (STATUS_QUE_REVOGAM.has(status) && pedido.codigo) {
    // estorno, contestação ou cancelamento depois da aprovação: o código deixa de valer
    await env.DB.prepare("UPDATE codigos SET ativo = 0 WHERE codigo = ?1").bind(pedido.codigo).run();
    esquecerCodigo(pedido.codigo);
    console.log(`Código do pedido ${pedido.id} desativado (pagamento ${status}).`);
  }
  return (await buscarPedido(env, pedido.id))!;
}

/**
 * Garante que um pedido aprovado tenha código e que o e-mail seja enviado uma única vez,
 * mesmo que o aviso do Mercado Pago chegue repetido ou ao mesmo tempo que a consulta da página.
 */
export async function garantirCodigo(env: Env, pedidoId: string): Promise<string | null> {
  const pedido = await buscarPedido(env, pedidoId);
  if (!pedido || pedido.status !== "approved") return null;
  if (pedido.codigo) return pedido.codigo;

  const novo = await criarCodigo(env, { pedidoId, email: pedido.email, origem: "compra" });
  const gravado = await env.DB.prepare("UPDATE pedidos SET codigo = ?2 WHERE id = ?1 AND codigo IS NULL").bind(pedidoId, novo).run();
  if (!gravado.meta.changes) {
    // outro processo criou o código primeiro: descarta este e usa o dele
    await env.DB.prepare("DELETE FROM codigos WHERE codigo = ?1").bind(novo).run();
    return (await buscarPedido(env, pedidoId))?.codigo ?? null;
  }
  console.log(`Pedido ${pedidoId} aprovado: código de acesso criado.`);
  await enviarAcesso(env, { ...pedido, codigo: novo });
  return novo;
}

export async function enviarAcesso(env: Env, pedido: Pedido & { codigo: string }): Promise<void> {
  const { enviado } = await enviarEmailDeAcesso(env, { para: pedido.email, codigo: pedido.codigo, pedidoId: pedido.id });
  if (enviado) await env.DB.prepare("UPDATE pedidos SET email_enviado_em = ?2 WHERE id = ?1").bind(pedido.id, agora()).run();
}
