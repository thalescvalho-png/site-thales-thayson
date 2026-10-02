// GET  /api/aparelhos?token=&aparelho=      aparelhos que usam o código (também para quem chegou ao limite)
// POST /api/aparelhos/liberar               { token, aparelho, ref } desconecta um aparelho
// GET  /api/tocando?token=&aparelho=        este aparelho ainda tem a vez de tocar?
// POST /api/tocando                         { token, aparelho } este aparelho deu play e pega a vez
import {
  conferirCodigo,
  credenciaisDoCorpo,
  lerCredenciais,
  liberarAparelho,
  listarAparelhos,
  marcarTocando,
  quemEstaTocando,
  respostaDeRecusa,
  verificarCredenciais,
} from "./acesso";
import { origemPermitida } from "./cors";
import { erro, ipDe, json, lerJson } from "./util";

export async function rotaAparelhos(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await env.LIMITE_CONSULTA.limit({ key: ipDe(request) })).success) return erro(429, "muitas_tentativas");
  const codigo = await conferirCodigo(request, env, lerCredenciais(request, url));
  if (!codigo.ok) return respostaDeRecusa(codigo.motivo);
  return json(await listarAparelhos(env, codigo.codigo, codigo.aparelho, codigo.limite));
}

export async function rotaLiberarAparelho(request: Request, env: Env): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: ipDe(request) })).success) return erro(429, "muitas_tentativas");
  const corpo = await lerJson<{ token?: string; aparelho?: string; ref?: string }>(request);
  const codigo = await conferirCodigo(request, env, credenciaisDoCorpo(corpo));
  if (!codigo.ok) return respostaDeRecusa(codigo.motivo);
  const ref = String(corpo?.ref ?? "");
  if (!/^[A-Za-z0-9_-]{12}$/.test(ref)) return erro(400, "aparelho_nao_encontrado");

  const resultado = await liberarAparelho(env, codigo.codigo, ref, codigo.aparelho);
  if (!resultado.ok) {
    return resultado.motivo === "limite_trocas"
      ? erro(429, "limite_trocas", "Você já trocou de aparelho várias vezes este mês. Fale com a gente para liberar.")
      : erro(404, "aparelho_nao_encontrado", "Esse aparelho já não está na lista.");
  }
  console.log(`Aparelho desconectado pelo comprador (código ${codigo.codigo.slice(0, 4)}…).`);
  return json({ ok: true, ...(await listarAparelhos(env, codigo.codigo, codigo.aparelho, codigo.limite)) });
}

export async function rotaTocando(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (request.method === "POST") {
    if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
    const acesso = await verificarCredenciais(request, env, ctx, credenciaisDoCorpo(await lerJson(request)));
    if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
    await marcarTocando(env, acesso.codigo, acesso.aparelho);
    return json({ meu: true });
  }
  // sem limite por IP: muitos celulares dividem o mesmo IP; código errado já tem o seu limite
  const acesso = await verificarCredenciais(request, env, ctx, lerCredenciais(request, url));
  if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
  return json(await quemEstaTocando(env, acesso.codigo, acesso.aparelho));
}
