// POST /api/reproducao { faixa, tipo }  soma +1 nas vezes que a faixa foi ouvida
// GET  /api/reproducoes                 total de cada faixa (prévias + completas), para mostrar na lista
//
// A página só envia depois de um trecho de verdade: 10 s da prévia ou 30 s da faixa completa.
// Como /api/evento: sem IP, cookie ou id guardados; o limite por IP só barra abuso.
import { lerEncarte } from "./album";
import { origemPermitida } from "./cors";
import { diaBrasilia, ipDe, json } from "./util";

const TIPOS = new Set(["previa", "completa"]);

export async function rotaReproducao(request: Request, env: Env): Promise<Response> {
  const vazio = new Response(null, { status: 204 });
  if (!origemPermitida(request, env)) return vazio;
  if (!(await env.LIMITE_EVENTOS.limit({ key: `ouvir:${ipDe(request)}` })).success) return vazio;
  let corpo: { faixa?: string; tipo?: string } = {};
  try {
    corpo = JSON.parse((await request.text()).slice(0, 300));
  } catch {
    return vazio;
  }
  const faixa = String(corpo.faixa ?? "");
  const tipo = String(corpo.tipo ?? "");
  if (!TIPOS.has(tipo)) return vazio;
  const encarte = await lerEncarte(env);
  if (!encarte?.faixas.some((f) => f.id === faixa)) return vazio;
  await env.DB.prepare(
    `INSERT INTO reproducoes_dia (dia, faixa, tipo, total) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (dia, faixa, tipo) DO UPDATE SET total = total + 1`,
  )
    .bind(diaBrasilia(), faixa, tipo)
    .run();
  return vazio;
}

export async function rotaReproducoes(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT faixa, SUM(total) AS total FROM reproducoes_dia GROUP BY faixa",
  ).all<{ faixa: string; total: number }>();
  const totais: Record<string, number> = {};
  for (const r of results) totais[r.faixa] = r.total;
  return json({ reproducoes: totais }, 200, { "Cache-Control": "public, max-age=60" });
}
