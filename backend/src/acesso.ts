// Confere o código de acesso e o limite de aparelhos/navegadores por código.
//
// Cada navegador cria um identificador aleatório ("aparelho") e o envia junto com o código.
// Um código aceita até LIMITE_APARELHOS identificadores diferentes (padrão 5).
import { agora, ipDe, normalizarCodigo } from "./util";

export type MotivoRecusa = "sem_codigo" | "codigo_invalido" | "sem_aparelho" | "limite_aparelhos" | "muitas_tentativas";
export type Acesso = { ok: true; codigo: string; aparelho: string } | { ok: false; motivo: MotivoRecusa };

const VALIDADE_MEMORIA = 5 * 60_000;
const validos = new Map<string, number>(); // "codigo|aparelho" -> válido até (ms), evita consultar o banco a cada trecho de áudio
const bloqueados = new Map<string, number>(); // ip -> bloqueado até (ms), depois de muitos códigos errados

export function lerCredenciais(request: Request, url: URL) {
  return {
    bruto: url.searchParams.get("token") ?? url.searchParams.get("codigo"),
    aparelho: (url.searchParams.get("aparelho") ?? request.headers.get("X-Aparelho") ?? "").trim(),
  };
}

export function esquecerCodigo(codigo: string): void {
  for (const chave of validos.keys()) if (chave.startsWith(`${codigo}|`)) validos.delete(chave);
}

export async function verificarAcesso(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Acesso> {
  const { bruto, aparelho } = lerCredenciais(request, url);
  if (!bruto) return { ok: false, motivo: "sem_codigo" };
  const ip = ipDe(request);
  const agoraMs = Date.now();
  if ((bloqueados.get(ip) ?? 0) > agoraMs) return { ok: false, motivo: "muitas_tentativas" };

  const codigo = normalizarCodigo(bruto);
  if (!codigo) return registrarErro(env, ip);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(aparelho)) return { ok: false, motivo: "sem_aparelho" };

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
    const limite = linha.limite ?? (Number(env.LIMITE_APARELHOS) || 5);
    if (linha.total >= limite) return { ok: false, motivo: "limite_aparelhos" };
    // insere só se ainda houver vaga (a conta é refeita dentro do próprio comando)
    const inserido = await env.DB.prepare(
      `INSERT INTO aparelhos (codigo, aparelho, descricao, primeiro_uso, ultimo_uso)
       SELECT ?1, ?2, ?3, ?4, ?4 WHERE (SELECT COUNT(*) FROM aparelhos WHERE codigo = ?1) < ?5
       ON CONFLICT (codigo, aparelho) DO NOTHING`,
    )
      .bind(codigo, aparelho, (request.headers.get("User-Agent") ?? "").slice(0, 160), quando, limite)
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

async function registrarErro(env: Env, ip: string): Promise<Acesso> {
  const { success } = await env.LIMITE_CODIGO_ERRADO.limit({ key: ip });
  if (success) return { ok: false, motivo: "codigo_invalido" };
  if (bloqueados.size > 5000) bloqueados.clear();
  bloqueados.set(ip, Date.now() + 60_000);
  return { ok: false, motivo: "muitas_tentativas" };
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
