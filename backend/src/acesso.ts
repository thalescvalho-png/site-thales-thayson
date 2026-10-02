// Confere o código de acesso e o limite de aparelhos/navegadores por código.
//
// Cada navegador cria um identificador aleatório ("aparelho") e o envia junto com o código.
// Um código aceita até LIMITE_APARELHOS identificadores diferentes (padrão 3). O próprio comprador
// vê a lista e desconecta um aparelho antigo para entrar num novo (até TROCAS_APARELHO_MES por mês).
import { assinar } from "./assinatura";
import { agora, ipDe, normalizarCodigo } from "./util";

export type MotivoRecusa = "sem_codigo" | "codigo_invalido" | "sem_aparelho" | "limite_aparelhos" | "muitas_tentativas";
export type Acesso = { ok: true; codigo: string; aparelho: string } | { ok: false; motivo: MotivoRecusa };
export type Credenciais = { bruto: string | null; aparelho: string };

const VALIDADE_MEMORIA = 5 * 60_000;
const validos = new Map<string, number>(); // "codigo|aparelho" -> válido até (ms), evita consultar o banco a cada trecho de áudio
const bloqueados = new Map<string, number>(); // ip -> bloqueado até (ms), depois de muitos códigos errados

export function lerCredenciais(request: Request, url: URL): Credenciais {
  return {
    bruto: url.searchParams.get("token") ?? url.searchParams.get("codigo"),
    aparelho: (url.searchParams.get("aparelho") ?? request.headers.get("X-Aparelho") ?? "").trim(),
  };
}

export function credenciaisDoCorpo(corpo: { token?: unknown; aparelho?: unknown } | null): Credenciais {
  return {
    bruto: typeof corpo?.token === "string" ? corpo.token : null,
    aparelho: typeof corpo?.aparelho === "string" ? corpo.aparelho.trim() : "",
  };
}

export function esquecerCodigo(codigo: string): void {
  for (const chave of validos.keys()) if (chave.startsWith(`${codigo}|`)) validos.delete(chave);
}

function aparelhoValido(aparelho: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(aparelho);
}

export function verificarAcesso(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Acesso> {
  return verificarCredenciais(request, env, ctx, lerCredenciais(request, url));
}

export async function verificarCredenciais(request: Request, env: Env, ctx: ExecutionContext, { bruto, aparelho }: Credenciais): Promise<Acesso> {
  if (!bruto) return { ok: false, motivo: "sem_codigo" };
  const ip = ipDe(request);
  const agoraMs = Date.now();
  if ((bloqueados.get(ip) ?? 0) > agoraMs) return { ok: false, motivo: "muitas_tentativas" };

  const codigo = normalizarCodigo(bruto);
  if (!codigo) return registrarErro(env, ip);
  if (!aparelhoValido(aparelho)) return { ok: false, motivo: "sem_aparelho" };

  const chave = `${codigo}|${aparelho}`;
  if ((validos.get(chave) ?? 0) > agoraMs) return { ok: true, codigo, aparelho };

  const linha = await env.DB.prepare(
    `SELECT c.ativo, c.limite_aparelhos AS limite,
            (SELECT ultimo_uso FROM aparelhos a WHERE a.codigo = c.codigo AND a.aparelho = ?2) AS visto,
            (SELECT COUNT(*) FROM aparelhos a WHERE a.codigo = c.codigo) AS total
       FROM codigos c WHERE c.codigo = ?1`,
  )
    .bind(codigo, aparelho)
    .first<{ ativo: number; limite: number | null; visto: string | null; total: number }>();
  if (!linha || !linha.ativo) return registrarErro(env, ip);

  const quando = agora();
  if (linha.visto) {
    if (agoraMs - Date.parse(linha.visto) > 6 * 3600_000) {
      ctx.waitUntil(
        env.DB.prepare("UPDATE aparelhos SET ultimo_uso = ?3 WHERE codigo = ?1 AND aparelho = ?2").bind(codigo, aparelho, quando).run(),
      );
    }
  } else {
    const limite = linha.limite ?? limitePadrao(env);
    if (linha.total >= limite) return { ok: false, motivo: "limite_aparelhos" };
    // insere só se ainda houver vaga (a conta é refeita dentro do próprio comando)
    const inserido = await env.DB.prepare(
      `INSERT INTO aparelhos (codigo, aparelho, descricao, primeiro_uso, ultimo_uso)
       SELECT ?1, ?2, ?3, ?4, ?4 WHERE (SELECT COUNT(*) FROM aparelhos WHERE codigo = ?1) < ?5
       ON CONFLICT (codigo, aparelho) DO NOTHING`,
    )
      .bind(codigo, aparelho, (request.headers.get("User-Agent") ?? "").slice(0, 300), quando, limite)
      .run();
    if (!inserido.meta.changes) {
      const jaExiste = await env.DB.prepare("SELECT 1 FROM aparelhos WHERE codigo = ?1 AND aparelho = ?2").bind(codigo, aparelho).first();
      if (!jaExiste) return { ok: false, motivo: "limite_aparelhos" };
    }
  }

  if (validos.size > 5000) validos.clear();
  validos.set(chave, agoraMs + VALIDADE_MEMORIA);
  return { ok: true, codigo, aparelho };
}

/**
 * Só confere se o código existe e está ativo, sem cadastrar o aparelho.
 * Serve para quem chegou ao limite de aparelhos poder ver a lista e liberar um antigo.
 */
export async function conferirCodigo(
  request: Request,
  env: Env,
  { bruto, aparelho }: Credenciais,
): Promise<{ ok: true; codigo: string; aparelho: string; limite: number } | { ok: false; motivo: MotivoRecusa }> {
  if (!bruto) return { ok: false, motivo: "sem_codigo" };
  const ip = ipDe(request);
  if ((bloqueados.get(ip) ?? 0) > Date.now()) return { ok: false, motivo: "muitas_tentativas" };
  const codigo = normalizarCodigo(bruto);
  if (!codigo) return registrarErro(env, ip);
  if (!aparelhoValido(aparelho)) return { ok: false, motivo: "sem_aparelho" };
  const linha = await env.DB.prepare("SELECT ativo, limite_aparelhos AS limite FROM codigos WHERE codigo = ?1")
    .bind(codigo)
    .first<{ ativo: number; limite: number | null }>();
  if (!linha || !linha.ativo) return registrarErro(env, ip);
  return { ok: true, codigo, aparelho, limite: linha.limite ?? limitePadrao(env) };
}

async function registrarErro(env: Env, ip: string): Promise<{ ok: false; motivo: MotivoRecusa }> {
  const { success } = await env.LIMITE_CODIGO_ERRADO.limit({ key: ip });
  if (success) return { ok: false, motivo: "codigo_invalido" };
  if (bloqueados.size > 5000) bloqueados.clear();
  bloqueados.set(ip, Date.now() + 60_000);
  return { ok: false, motivo: "muitas_tentativas" };
}

export function limitePadrao(env: Env): number {
  return Number(env.LIMITE_APARELHOS) || 3;
}

export function respostaDeRecusa(motivo: MotivoRecusa): Response {
  const status = motivo === "muitas_tentativas" ? 429 : motivo === "limite_aparelhos" ? 403 : 401;
  const mensagens: Record<MotivoRecusa, string> = {
    sem_codigo: "Falta o código de acesso.",
    codigo_invalido: "Código de acesso inválido.",
    sem_aparelho: "Falta o identificador do aparelho.",
    limite_aparelhos: "Este código já foi usado no número máximo de aparelhos.",
    muitas_tentativas: "Muitas tentativas seguidas. Espere um minuto.",
  };
  return new Response(JSON.stringify({ erro: motivo, mensagem: mensagens[motivo] }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ----- Aparelhos do comprador -----

/** "iPhone · Safari", "Celular Android · Chrome", "Computador Windows · Edge"... */
export function descreverAparelho(ua: string | null): string {
  const u = ua ?? "";
  const sistema = /iPhone/.test(u)
    ? "iPhone"
    : /iPad/.test(u)
      ? "iPad"
      : /Android/.test(u)
        ? /Mobile/.test(u) ? "Celular Android" : "Tablet Android"
        : /Windows/.test(u)
          ? "Computador Windows"
          : /Macintosh|Mac OS X/.test(u)
            ? "Mac"
            : /CrOS/.test(u)
              ? "Chromebook"
              : /Linux/.test(u)
                ? "Computador Linux"
                : "Aparelho";
  const navegador = /Instagram/.test(u)
    ? "app do Instagram"
    : /FBAN|FBAV|FB_IAB/.test(u)
      ? "app do Facebook"
      : /SamsungBrowser/.test(u)
        ? "Samsung Internet"
        : /Edg(A|iOS)?\//.test(u)
          ? "Edge"
          : /OPR\/|Opera/.test(u)
            ? "Opera"
            : /Firefox|FxiOS/.test(u)
              ? "Firefox"
              : /CriOS|Chrome\//.test(u)
                ? "Chrome"
                : /Safari\//.test(u)
                  ? "Safari"
                  : "";
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

/** Apelido de um aparelho para a lista: o identificador de verdade nunca sai do servidor. */
function refDoAparelho(env: Env, codigo: string, aparelho: string): Promise<string> {
  return assinar(env, `aparelho:${codigo}|${aparelho}`, 12);
}

type LinhaAparelho = { aparelho: string; descricao: string | null; primeiro_uso: string; ultimo_uso: string };

export async function listarAparelhos(env: Env, codigo: string, aparelhoAtual: string, limite: number) {
  const [{ results }, tocando, trocas] = await Promise.all([
    env.DB.prepare("SELECT aparelho, descricao, primeiro_uso, ultimo_uso FROM aparelhos WHERE codigo = ?1 ORDER BY primeiro_uso")
      .bind(codigo)
      .all<LinhaAparelho>(),
    env.DB.prepare("SELECT tocando_aparelho AS aparelho FROM codigos WHERE codigo = ?1").bind(codigo).first<{ aparelho: string | null }>(),
    trocasRestantes(env, codigo),
  ]);
  const aparelhos = await Promise.all(
    results.map(async (a) => ({
      ref: await refDoAparelho(env, codigo, a.aparelho),
      nome: descreverAparelho(a.descricao),
      primeiroUso: a.primeiro_uso,
      ultimoUso: a.ultimo_uso,
      este: a.aparelho === aparelhoAtual,
      tocando: a.aparelho === tocando?.aparelho,
    })),
  );
  return { aparelhos, limite, trocasRestantes: trocas };
}

async function trocasRestantes(env: Env, codigo: string): Promise<number> {
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
  const linha = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM aparelhos_liberados WHERE codigo = ?1 AND liberado_em > ?2 AND (por_aparelho IS NULL OR por_aparelho <> aparelho)",
  )
    .bind(codigo, desde)
    .first<{ total: number }>();
  return Math.max(0, (Number(env.TROCAS_APARELHO_MES) || 3) - (linha?.total ?? 0));
}

/**
 * Desconecta um aparelho do código. Sair do próprio aparelho é sempre permitido;
 * desconectar outro conta no limite de trocas do mês.
 */
export async function liberarAparelho(
  env: Env,
  codigo: string,
  ref: string,
  porAparelho: string,
): Promise<{ ok: true } | { ok: false; motivo: "aparelho_nao_encontrado" | "limite_trocas" }> {
  const { results } = await env.DB.prepare("SELECT aparelho, descricao FROM aparelhos WHERE codigo = ?1").bind(codigo).all<LinhaAparelho>();
  let alvo: LinhaAparelho | undefined;
  for (const a of results) if ((await refDoAparelho(env, codigo, a.aparelho)) === ref) alvo = a;
  if (!alvo) return { ok: false, motivo: "aparelho_nao_encontrado" };
  if (alvo.aparelho !== porAparelho && (await trocasRestantes(env, codigo)) <= 0) return { ok: false, motivo: "limite_trocas" };

  await env.DB.batch([
    env.DB.prepare("DELETE FROM aparelhos WHERE codigo = ?1 AND aparelho = ?2").bind(codigo, alvo.aparelho),
    env.DB.prepare("INSERT INTO aparelhos_liberados (codigo, aparelho, descricao, liberado_em, por_aparelho) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
      codigo,
      alvo.aparelho,
      alvo.descricao,
      agora(),
      porAparelho,
    ),
    env.DB.prepare("UPDATE codigos SET tocando_aparelho = NULL WHERE codigo = ?1 AND tocando_aparelho = ?2").bind(codigo, alvo.aparelho),
  ]);
  esquecerCodigo(codigo);
  return { ok: true };
}

// ----- Uma reprodução por vez -----
// Quem dá play "pega a vez". Os outros aparelhos perguntam de tempos em tempos e pausam se perderam a vez.

export async function marcarTocando(env: Env, codigo: string, aparelho: string): Promise<void> {
  await env.DB.prepare("UPDATE codigos SET tocando_aparelho = ?2, tocando_em = ?3 WHERE codigo = ?1").bind(codigo, aparelho, agora()).run();
}

export async function quemEstaTocando(env: Env, codigo: string, aparelho: string): Promise<{ meu: boolean; outro?: string }> {
  const linha = await env.DB.prepare(
    `SELECT c.tocando_aparelho AS tocando, a.descricao
       FROM codigos c LEFT JOIN aparelhos a ON a.codigo = c.codigo AND a.aparelho = c.tocando_aparelho
      WHERE c.codigo = ?1`,
  )
    .bind(codigo)
    .first<{ tocando: string | null; descricao: string | null }>();
  if (!linha?.tocando || linha.tocando === aparelho) return { meu: true };
  return { meu: false, outro: descreverAparelho(linha.descricao) };
}
