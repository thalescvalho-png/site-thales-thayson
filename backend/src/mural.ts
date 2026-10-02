// Mural dos ouvintes: comentários sobre o álbum ou sobre uma faixa, com moderação.
//
// GET  /api/comentarios                 comentários publicados (nome, cidade, texto, faixa, selo de apoiador)
// POST /api/comentarios                 { nome, cidade?, texto, faixa?, email?, token?, aparelho?, novidades? }
// POST /api/comentarios/confirmar       { id, segredo }  link do e-mail de confirmação
//
// Quem comprou comenta direto (o código identifica) e ganha o selo de apoiador.
// Quem não comprou informa o e-mail. Com o envio de e-mails ligado (RESEND_API_KEY), o comentário
// só segue depois que a pessoa confirma pelo link; sem ele, segue direto para a moderação.
// MURAL_MODERACAO = "antes": tudo espera aprovação; "depois": publica direto (e vocês apagam se preciso).
// O e-mail nunca aparece no site.
import { credenciaisDoCorpo, respostaDeRecusa, verificarCredenciais } from "./acesso";
import { lerEncarte } from "./album";
import { registrarContato } from "./contatos";
import { origemPermitida } from "./cors";
import { emailConfigurado, enviarConfirmacaoMural } from "./email";
import { agora, emailValido, erro, idAleatorio, ipDe, iguaisSeguro, json, lerJson, limparTexto } from "./util";

const POR_DIA = 5; // comentários por pessoa a cada 24 h

export type Comentario = {
  id: string;
  faixa: string | null;
  nome: string;
  cidade: string | null;
  texto: string;
  email: string;
  apoiador: number;
  status: string;
  confirmacao: string | null;
  criado_em: string;
  publicado_em: string | null;
};

function publicarDireto(env: Env): boolean {
  return String(env.MURAL_MODERACAO) === "depois";
}

export async function rotaComentarios(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, faixa, nome, cidade, texto, apoiador, COALESCE(publicado_em, criado_em) AS quando
         FROM comentarios WHERE status = 'publicado' ORDER BY quando DESC LIMIT 200`,
    ).all<{ id: string; faixa: string | null; nome: string; cidade: string | null; texto: string; apoiador: number; quando: string }>();
    return json(
      { comentarios: results.map((c) => ({ ...c, apoiador: c.apoiador === 1 })) },
      200,
      { "Cache-Control": "public, max-age=30" },
    );
  }

  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: ipDe(request) })).success) {
    return erro(429, "muitas_tentativas", "Muitos envios seguidos. Espere um minuto e tente de novo.");
  }
  const corpo = await lerJson<{
    nome?: string;
    cidade?: string;
    texto?: string;
    faixa?: string;
    email?: string;
    token?: string;
    aparelho?: string;
    novidades?: boolean;
  }>(request);
  if (!corpo) return erro(400, "dados_invalidos");

  const nome = limparTexto(corpo.nome, 60);
  const cidade = limparTexto(corpo.cidade, 60) || null;
  const texto = limparTexto(corpo.texto, 1000, true);
  if (nome.length < 2) return erro(400, "nome_invalido", "Escreva seu nome.");
  if (texto.length < 3) return erro(400, "texto_invalido", "Escreva seu comentário.");

  let faixa: string | null = null;
  if (corpo.faixa) {
    const encarte = await lerEncarte(env);
    faixa = encarte?.faixas.find((f) => f.id === corpo.faixa)?.id ?? null;
    if (!faixa) return erro(400, "faixa_invalida");
  }

  // quem tem código é apoiador; quem não tem informa o e-mail
  let email: string;
  let apoiador = false;
  if (corpo.token) {
    const acesso = await verificarCredenciais(request, env, ctx, credenciaisDoCorpo(corpo));
    if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
    const dono = await env.DB.prepare("SELECT email FROM codigos WHERE codigo = ?1").bind(acesso.codigo).first<{ email: string | null }>();
    email = dono?.email ?? `codigo-${acesso.codigo.slice(0, 4).toLowerCase()}@sem-email.invalid`;
    apoiador = true;
  } else {
    email = String(corpo.email ?? "").trim().toLowerCase();
    if (!emailValido(email)) return erro(400, "email_invalido", "Informe um e-mail válido. Ele não aparece no mural.");
  }

  const desde = new Date(Date.now() - 86400_000).toISOString();
  const recentes = await env.DB.prepare("SELECT COUNT(*) AS total FROM comentarios WHERE email = ?1 AND criado_em > ?2")
    .bind(email, desde)
    .first<{ total: number }>();
  if ((recentes?.total ?? 0) >= POR_DIA) return erro(429, "limite_comentarios", "Você já comentou bastante hoje. Volte amanhã!");

  // sem e-mail confirmado, quem não comprou sempre passa pela moderação
  const confirmar = !apoiador && emailConfigurado(env);
  const status = confirmar ? "confirmar_email" : apoiador && publicarDireto(env) ? "publicado" : "pendente";
  const id = idAleatorio(12);
  const segredo = confirmar ? idAleatorio(16) : null;
  const quando = agora();
  await env.DB.prepare(
    `INSERT INTO comentarios (id, faixa, nome, cidade, texto, email, apoiador, status, confirmacao, criado_em, publicado_em)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(id, faixa, nome, cidade, texto, email, apoiador ? 1 : 0, status, segredo, quando, status === "publicado" ? quando : null)
    .run();
  if (!email.endsWith(".invalid")) {
    await registrarContato(env, { email, nome, origem: "mural", novidades: corpo.novidades === true, comprador: apoiador });
  }

  if (confirmar) {
    const link = new URL(env.PAGINA_ALBUM);
    link.searchParams.set("confirmar", `${id}.${segredo}`);
    link.hash = "mural";
    const { enviado } = await enviarConfirmacaoMural(env, { para: email, nome, link: link.toString(), comentarioId: id });
    if (!enviado) {
      // sem como confirmar agora: o comentário segue para a moderação, que decide
      await env.DB.prepare("UPDATE comentarios SET status = 'pendente', confirmacao = NULL WHERE id = ?1").bind(id).run();
      return json({ ok: true, status: "pendente" }, 201);
    }
  }
  return json({ ok: true, status }, 201);
}

export async function rotaConfirmarComentario(request: Request, env: Env): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: ipDe(request) })).success) return erro(429, "muitas_tentativas");
  const corpo = await lerJson<{ id?: string; segredo?: string }>(request);
  const id = String(corpo?.id ?? "");
  const segredo = String(corpo?.segredo ?? "");
  const comentario = /^[A-Za-z0-9_-]{16}$/.test(id)
    ? await env.DB.prepare("SELECT * FROM comentarios WHERE id = ?1").bind(id).first<Comentario>()
    : null;
  if (!comentario) return erro(404, "comentario_nao_encontrado", "Não encontramos esse comentário. Ele pode ter sido removido.");
  if (comentario.status !== "confirmar_email") return json({ ok: true, status: comentario.status });
  if (!comentario.confirmacao || !iguaisSeguro(comentario.confirmacao, segredo)) return erro(400, "link_invalido", "Este link de confirmação não é válido.");

  const status = publicarDireto(env) ? "publicado" : "pendente";
  const quando = agora();
  await env.DB.prepare("UPDATE comentarios SET status = ?2, confirmacao = NULL, publicado_em = ?3 WHERE id = ?1")
    .bind(id, status, status === "publicado" ? quando : null)
    .run();
  return json({ ok: true, status });
}
