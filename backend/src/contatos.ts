// Lista única de e-mails (tabela contatos).
//
// Entra na lista quem compra, quem pede "me avise das novidades" depois da prévia e quem comenta no mural.
// Só recebe novidades quem marcou a caixa de consentimento (novidades = 1) e não se descadastrou.
//
// POST /api/novidades    { email, nome?, aceite: true, origem }  "me avise das novidades"
// POST /api/descadastrar { email, chave }                        link de descadastro dos e-mails
import { chaveDescadastro, assinaturaConfere } from "./assinatura";
import { origemPermitida } from "./cors";
import { agora, emailValido, erro, ipDe, json, lerJson, limparTexto } from "./util";

export type OrigemContato = "compra" | "previa" | "mural";

export async function registrarContato(
  env: Env,
  dados: { email: string; nome?: string | null; origem: OrigemContato; novidades: boolean; comprador?: boolean },
): Promise<void> {
  const quando = agora();
  await env.DB.prepare(
    `INSERT INTO contatos (email, nome, origem, novidades, novidades_em, novidades_origem, comprador, criado_em, atualizado_em)
     VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 = 1 THEN ?6 END, CASE WHEN ?4 = 1 THEN ?3 END, ?5, ?6, ?6)
     ON CONFLICT (email) DO UPDATE SET
       nome = COALESCE(excluded.nome, contatos.nome),
       novidades = MAX(contatos.novidades, excluded.novidades),
       novidades_em = CASE WHEN excluded.novidades = 1 THEN excluded.novidades_em ELSE contatos.novidades_em END,
       novidades_origem = CASE WHEN excluded.novidades = 1 THEN excluded.novidades_origem ELSE contatos.novidades_origem END,
       descadastrado_em = CASE WHEN excluded.novidades = 1 THEN NULL ELSE contatos.descadastrado_em END,
       comprador = MAX(contatos.comprador, excluded.comprador),
       atualizado_em = excluded.atualizado_em`,
  )
    .bind(dados.email.toLowerCase(), dados.nome || null, dados.origem, dados.novidades ? 1 : 0, dados.comprador ? 1 : 0, quando)
    .run();
}

/** Link que vai no rodapé de todo e-mail de novidades. */
export async function linkDescadastro(env: Env, email: string): Promise<string> {
  const link = new URL("descadastro.html", env.PAGINA_ALBUM);
  link.searchParams.set("email", email);
  link.searchParams.set("chave", await chaveDescadastro(env, email));
  return link.toString();
}

export async function rotaNovidades(request: Request, env: Env): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: ipDe(request) })).success) {
    return erro(429, "muitas_tentativas", "Muitas tentativas seguidas. Espere um minuto e tente de novo.");
  }
  const corpo = await lerJson<{ email?: string; nome?: string; aceite?: boolean; origem?: string }>(request);
  const email = String(corpo?.email ?? "").trim().toLowerCase();
  if (!emailValido(email)) return erro(400, "email_invalido", "Informe um e-mail válido.");
  if (corpo?.aceite !== true) return erro(400, "sem_consentimento", "Marque a caixa para receber as novidades.");
  const origem: OrigemContato = corpo.origem === "mural" ? "mural" : "previa";
  await registrarContato(env, { email, nome: limparTexto(corpo.nome, 60) || null, origem, novidades: true });
  return json({ ok: true });
}

export async function rotaDescadastrar(request: Request, env: Env): Promise<Response> {
  if (!origemPermitida(request, env)) return erro(403, "origem_nao_permitida");
  if (!(await env.LIMITE_FORMULARIO.limit({ key: ipDe(request) })).success) return erro(429, "muitas_tentativas");
  const corpo = await lerJson<{ email?: string; chave?: string }>(request);
  const email = String(corpo?.email ?? "").trim().toLowerCase();
  const chave = String(corpo?.chave ?? "");
  if (!emailValido(email) || !(await assinaturaConfere(env, `descadastro:${email}`, chave, 24))) {
    return erro(400, "link_invalido", "Este link de descadastro não é válido. Copie o endereço completo do e-mail.");
  }
  const quando = agora();
  // quem não estava na lista também fica registrado, para nunca receber novidades
  await env.DB.prepare(
    `INSERT INTO contatos (email, origem, novidades, descadastrado_em, criado_em, atualizado_em)
     VALUES (?1, 'previa', 0, ?2, ?2, ?2)
     ON CONFLICT (email) DO UPDATE SET novidades = 0, descadastrado_em = COALESCE(contatos.descadastrado_em, ?2), atualizado_em = ?2`,
  )
    .bind(email, quando)
    .run();
  console.log("Contato descadastrado da lista de novidades.");
  return json({ ok: true });
}
