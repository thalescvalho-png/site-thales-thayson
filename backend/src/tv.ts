// Modo TV: a página /tv aberta no navegador da TV e o celular de quem comprou como controle remoto.
//
// POST /api/tv/sessao                 a TV pede um código curto (vale 10 min até alguém confirmar)
// POST /api/tv/parear                 { token, aparelho, tv } o celular confirma o código da tela
// GET  /api/tv/ws?sala=&segredo=      conexão da TV
// GET  /api/tv/ws?sala=&token=&aparelho=  conexão do celular (controle)
// A conversa entre os dois acontece na sala (src/sala-tv.ts), um Durable Object por TV.
import { credenciaisDoCorpo, lerCredenciais, respostaDeRecusa, verificarCredenciais } from "./acesso";
import { origemPermitida } from "./cors";
import { erro, idAleatorio, ipDe, json, lerJson } from "./util";

// mesmos símbolos dos códigos de acesso (sem 0/O e 1/I, fáceis de ler na TV e de digitar)
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO_CODIGO_TV = 6;

function sortearCodigo(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(TAMANHO_CODIGO_TV)), (b) => ALFABETO[b & 31]).join("");
}

/** "k7q 4md" ou "K7Q-4MD" -> "K7Q4MD"; null se não for um código de TV válido. */
export function normalizarCodigoTv(bruto: unknown): string | null {
  const limpo = String(bruto ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo.length !== TAMANHO_CODIGO_TV || [...limpo].some((c) => !ALFABETO.includes(c))) return null;
  return limpo;
}

function sala(env: Env, codigo: string) {
  return env.SALA_TV.get(env.SALA_TV.idFromName(`tv:${codigo}`));
}

export async function rotaTvSessao(request: Request, env: Env, url: URL): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: `tv:${ipDe(request)}` })).success) return erro(429, "muitas_tentativas");
  const segredo = idAleatorio(24);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = sortearCodigo();
    if (await sala(env, codigo).criar(codigo, segredo, url.origin)) return json({ sala: codigo, segredo, validadeMin: 10 });
  }
  return erro(503, "sem_codigo", "Não foi possível gerar um código agora. Recarregue a página.");
}

export async function rotaTvParear(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: `tv:${ipDe(request)}` })).success) {
    return erro(429, "muitas_tentativas", "Muitas tentativas seguidas. Espere um minuto.");
  }
  const corpo = await lerJson<{ token?: string; aparelho?: string; tv?: string }>(request);
  const acesso = await verificarCredenciais(request, env, ctx, credenciaisDoCorpo(corpo));
  if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
  const codigoTv = normalizarCodigoTv(corpo?.tv);
  if (!codigoTv) return erro(400, "codigo_tv_invalido", "Confira o código que aparece na TV (6 letras e números).");

  const r = await sala(env, codigoTv).parear(acesso.codigo, acesso.aparelho);
  if (!r.ok) {
    return r.motivo === "sala_ocupada"
      ? erro(409, "tv_ocupada", "Esta TV já está conectada a outra conta.")
      : erro(404, "codigo_tv_nao_encontrado", "Código não encontrado ou vencido. Recarregue a página na TV para ver um código novo.");
  }
  return json({ ok: true, sala: codigoTv });
}

/** Abre a conexão WebSocket da TV ou do celular. A resposta não pode passar pelo CORS (src/index.ts). */
export async function rotaTvWs(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return erro(426, "precisa_websocket");
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  const codigoTv = normalizarCodigoTv(url.searchParams.get("sala"));
  if (!codigoTv) return erro(404, "sala_inexistente");

  const cabecalhos = new Headers(request.headers);
  for (const nome of ["X-Papel", "X-Segredo", "X-Codigo"]) cabecalhos.delete(nome); // só o Worker preenche estes
  const segredo = url.searchParams.get("segredo");
  if (segredo) {
    cabecalhos.set("X-Papel", "tv");
    cabecalhos.set("X-Segredo", segredo);
  } else {
    const acesso = await verificarCredenciais(request, env, ctx, lerCredenciais(request, url));
    if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
    cabecalhos.set("X-Papel", "controle");
    cabecalhos.set("X-Codigo", acesso.codigo);
  }
  // a sala só enxerga o cabeçalho de papel; o endereço vai sem o código de acesso
  return sala(env, codigoTv).fetch(new Request("https://sala/ws", { headers: cabecalhos }));
}
