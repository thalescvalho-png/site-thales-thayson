// Página de administração (admin.html): moderar o mural e ver o resumo de vendas, funil e lista.
// Toda chamada leva a senha ADMIN_SENHA (npx wrangler secret put ADMIN_SENHA) no cabeçalho Authorization.
//
// GET  /api/admin/comentarios?status=pendente   comentários (com o e-mail, que só vocês veem)
// POST /api/admin/comentarios                   { id, acao: "publicar" | "recusar" | "apagar" }
// GET  /api/admin/resumo?dias=30                vendas por origem, funil por dia e tamanho da lista
import { origemPermitida } from "./cors";
import { agora, erro, ipDe, iguaisSeguro, json, lerJson } from "./util";

async function autorizado(request: Request, env: Env): Promise<Response | null> {
  if (!env.ADMIN_SENHA) return erro(503, "admin_nao_configurado", "Cadastre a senha com: npx wrangler secret put ADMIN_SENHA");
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  const senha = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (senha && iguaisSeguro(senha, env.ADMIN_SENHA)) return null;
  const { success } = await env.LIMITE_CODIGO_ERRADO.limit({ key: `admin:${ipDe(request)}` });
  return success ? erro(401, "senha_errada", "Senha incorreta.") : erro(429, "muitas_tentativas", "Muitas tentativas. Espere um minuto.");
}

export async function rotaAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const recusa = await autorizado(request, env);
  if (recusa) return recusa;

  if (url.pathname === "/api/admin/comentarios" && request.method === "GET") {
    const status = url.searchParams.get("status") ?? "pendente";
    if (!["pendente", "publicado", "recusado", "confirmar_email"].includes(status)) return erro(400, "status_invalido");
    const { results } = await env.DB.prepare(
      `SELECT id, faixa, nome, cidade, texto, email, apoiador, status, criado_em, publicado_em
         FROM comentarios WHERE status = ?1 ORDER BY criado_em DESC LIMIT 300`,
    )
      .bind(status)
      .all();
    return json({ comentarios: results });
  }

  if (url.pathname === "/api/admin/comentarios" && request.method === "POST") {
    const corpo = await lerJson<{ id?: string; acao?: string }>(request);
    const id = String(corpo?.id ?? "");
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return erro(400, "id_invalido");
    const acao = corpo?.acao;
    const resultado =
      acao === "publicar"
        ? await env.DB.prepare("UPDATE comentarios SET status = 'publicado', confirmacao = NULL, publicado_em = COALESCE(publicado_em, ?2) WHERE id = ?1")
            .bind(id, agora())
            .run()
        : acao === "recusar"
          ? await env.DB.prepare("UPDATE comentarios SET status = 'recusado' WHERE id = ?1").bind(id).run()
          : acao === "apagar"
            ? await env.DB.prepare("DELETE FROM comentarios WHERE id = ?1").bind(id).run()
            : null;
    if (!resultado) return erro(400, "acao_invalida");
    if (!resultado.meta.changes) return erro(404, "comentario_nao_encontrado");
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/resumo" && request.method === "GET") {
    const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 30, 1), 365);
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();
    const diaDesde = desde.slice(0, 10);
    const [vendas, funil, lista, mural, ouvidas] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(origem, 'direto') AS origem, COUNT(*) AS pedidos, ROUND(SUM(valor), 2) AS valor
           FROM pedidos WHERE status = 'approved' AND pago_em > ?1 GROUP BY 1 ORDER BY pedidos DESC`,
      )
        .bind(desde)
        .all(),
      env.DB.prepare(
        `SELECT evento, origem, SUM(total) AS total FROM eventos_dia WHERE dia >= ?1 GROUP BY evento, origem ORDER BY evento, total DESC`,
      )
        .bind(diaDesde)
        .all(),
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN novidades = 1 AND descadastrado_em IS NULL THEN 1 ELSE 0 END) AS recebem_novidades,
                SUM(comprador) AS compradores,
                SUM(CASE WHEN descadastrado_em IS NOT NULL THEN 1 ELSE 0 END) AS descadastrados
           FROM contatos`,
      ).first(),
      env.DB.prepare("SELECT status, COUNT(*) AS total FROM comentarios GROUP BY status").all(),
      env.DB.prepare(
        `SELECT faixa,
                SUM(CASE WHEN tipo = 'previa' THEN total ELSE 0 END) AS previas,
                SUM(CASE WHEN tipo = 'completa' THEN total ELSE 0 END) AS completas
           FROM reproducoes_dia WHERE dia >= ?1 GROUP BY faixa ORDER BY faixa`,
      )
        .bind(diaDesde)
        .all(),
    ]);
    return json({ dias, vendas: vendas.results, funil: funil.results, lista, mural: mural.results, reproducoes: ouvidas.results });
  }

  return erro(404, "nao_encontrado");
}
