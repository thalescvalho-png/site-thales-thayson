// POST /api/webhook/mercadopago -> aviso de pagamento enviado pelo Mercado Pago
//
// 1. confere a assinatura (x-signature) com MP_WEBHOOK_SECRET;
// 2. consulta o pagamento na API (nunca confia só no aviso);
// 3. se aprovado: marca o pedido como pago, cria o código e envia o e-mail.
import { assinaturaValida, consultarPagamento } from "./mercadopago";
import { buscarPedido, registrarPagamento } from "./pedidos";
import { erro, json, lerJson } from "./util";

export async function rotaWebhook(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.MP_WEBHOOK_SECRET || !env.MP_ACCESS_TOKEN) {
    console.warn("Aviso do Mercado Pago recebido, mas MP_WEBHOOK_SECRET ou MP_ACCESS_TOKEN não estão configurados.");
    return erro(503, "nao_configurado");
  }
  if (!(await assinaturaValida(request, url, env.MP_WEBHOOK_SECRET))) {
    console.warn("Aviso do Mercado Pago recusado: assinatura inválida.");
    return erro(401, "assinatura_invalida");
  }

  const corpo = (await lerJson<{ type?: string; data?: { id?: string | number } }>(request, 65_536)) ?? {};
  const tipo = url.searchParams.get("type") ?? corpo.type ?? url.searchParams.get("topic");
  const id = url.searchParams.get("data.id") ?? corpo.data?.id;
  if (tipo !== "payment" || !id) return json({ ok: true, ignorado: true });

  const pagamento = await consultarPagamento(env, String(id));
  if (!pagamento) return json({ ok: true, ignorado: "pagamento_nao_encontrado" }); // ex.: teste do painel com id fictício

  const pedidoId = pagamento.external_reference ?? "";
  const pedido = pedidoId ? await buscarPedido(env, pedidoId) : null;
  if (!pedido) {
    console.warn(`Pagamento ${pagamento.id} sem pedido correspondente (referência "${pedidoId}").`);
    return json({ ok: true, ignorado: "pedido_nao_encontrado" });
  }
  const atualizado = await registrarPagamento(env, pedido, pagamento);
  return json({ ok: true, status: atualizado.status });
}
