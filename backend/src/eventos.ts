// POST /api/evento { evento, origem }  conta uma etapa do funil (prévia → comprar → compra concluída)
//
// Só soma +1 numa contagem por dia, etapa e origem. Nada identifica a pessoa: sem IP, sem cookie, sem id.
// A página envia com navigator.sendBeacon (texto simples), então não há resposta para ela esperar.
import { origemPermitida } from "./cors";
import { diaBrasilia, ipDe, limparOrigem } from "./util";

export const EVENTOS = new Set([
  "visita", // abriu a página do álbum
  "previa", // tocou a primeira prévia
  "previa_fim", // ouviu uma prévia até o fim
  "abrir_compra", // abriu o formulário de compra
  "pagamento", // o formulário do Mercado Pago apareceu
  "compra", // compra concluída nesta página
  "novidades", // pediu "me avise das novidades"
  "compartilhar", // gerou um cartão para Stories
  "comentario", // enviou um comentário ao mural
  "links", // abriu a página de links da bio
]);

export async function rotaEvento(request: Request, env: Env): Promise<Response> {
  const vazio = new Response(null, { status: 204 });
  if (!origemPermitida(request, env)) return vazio;
  if (!(await env.LIMITE_EVENTOS.limit({ key: ipDe(request) })).success) return vazio;
  let corpo: { evento?: string; origem?: string } = {};
  try {
    corpo = JSON.parse((await request.text()).slice(0, 500));
  } catch {
    return vazio;
  }
  const evento = String(corpo.evento ?? "");
  if (!EVENTOS.has(evento)) return vazio;
  await env.DB.prepare(
    `INSERT INTO eventos_dia (dia, evento, origem, total) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (dia, evento, origem) DO UPDATE SET total = total + 1`,
  )
    .bind(diaBrasilia(), evento, limparOrigem(corpo.origem))
    .run();
  return vazio;
}
