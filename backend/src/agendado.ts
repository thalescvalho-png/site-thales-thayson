// Tarefa automática (a cada 10 minutos): rede de segurança caso algum aviso do Mercado Pago
// ou algum e-mail se perca, e limpeza de comentários nunca confirmados.
import { consultarPagamento } from "./mercadopago";
import { enviarAcesso, garantirCodigo, registrarPagamento, type Pedido } from "./pedidos";

export async function tarefaAgendada(env: Env): Promise<void> {
  const desde = new Date(Date.now() - 3 * 86400_000).toISOString();

  // 1. pagamentos ainda pendentes dos últimos 3 dias: pergunta ao Mercado Pago
  if (env.MP_ACCESS_TOKEN) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM pedidos WHERE status IN ('pending', 'in_process', 'authorized')
          AND mp_pagamento_id IS NOT NULL AND criado_em > ?1 ORDER BY criado_em LIMIT 15`,
    )
      .bind(desde)
      .all<Pedido>();
    for (const pedido of results) {
      try {
        const pagamento = await consultarPagamento(env, pedido.mp_pagamento_id!);
        if (pagamento) await registrarPagamento(env, pedido, pagamento);
      } catch (e) {
        console.error(`Falha ao conferir o pedido ${pedido.id}:`, e);
      }
    }
  }

  // 2. aprovados que ficaram sem código (falha no meio do caminho)
  const semCodigo = await env.DB.prepare("SELECT id FROM pedidos WHERE status = 'approved' AND codigo IS NULL LIMIT 10").all<{ id: string }>();
  for (const { id } of semCodigo.results) await garantirCodigo(env, id);

  // 3. e-mails que não saíram (ex.: pedidos feitos antes de configurar o RESEND_API_KEY)
  if (env.RESEND_API_KEY) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM pedidos WHERE status = 'approved' AND codigo IS NOT NULL
          AND email_enviado_em IS NULL AND pago_em > ?1 LIMIT 10`,
    )
      .bind(desde)
      .all<Pedido & { codigo: string }>();
    for (const pedido of results) await enviarAcesso(env, pedido);
  }

  // 4. prazos da Política de Privacidade: comentários nunca confirmados (7 dias), recusados (30 dias)
  //    e o registro de trocas de aparelho (12 meses)
  const dias = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comentarios WHERE status = 'confirmar_email' AND criado_em < ?1").bind(dias(7)),
    env.DB.prepare("DELETE FROM comentarios WHERE status = 'recusado' AND criado_em < ?1").bind(dias(30)),
    env.DB.prepare("DELETE FROM aparelhos_liberados WHERE liberado_em < ?1").bind(dias(365)),
  ]);
}
