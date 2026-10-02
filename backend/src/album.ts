// GET /api/album            -> faixas e prévias (público)
// GET /api/album?token=...  -> também áudio completo, letras e encarte (JSON e PDF)
// GET /api/links?token=...  -> links novos das faixas (os anteriores expiram em 30 minutos)
// GET /api/preview|stream|download/:arquivo
import { lerCredenciais, respostaDeRecusa, verificarAcesso } from "./acesso";
import { nomePermitido, servirDoR2 } from "./arquivos";
import { apelidoDoCodigo, conferirLink, linkAssinado, VALIDADE_LINKS_S, type TipoArquivo } from "./assinatura";
import { erro, ipDe, json } from "./util";

type Faixa = {
  numero: number;
  id: string;
  titulo: string;
  idioma?: string;
  creditos: { letra: string; musica: string };
  cores?: { tom: string; tom2: string };
  letra: string[][];
};
type Encarte = {
  album: string;
  artistas: string;
  descricao?: string;
  faixas: Faixa[];
  creditosGerais: { funcao: string; nomes: string }[];
};

// O encarte.json fica no R2 (full/encarte.json) e é guardado na memória por 5 minutos.
let memoria: { encarte: Encarte; ate: number } | null = null;

export async function lerEncarte(env: Env): Promise<Encarte | null> {
  if (memoria && memoria.ate > Date.now()) return memoria.encarte;
  const objeto = await env.ARQUIVOS.get("full/encarte.json");
  if (!objeto) return null;
  const encarte = await objeto.json<Encarte>();
  memoria = { encarte, ate: Date.now() + 5 * 60_000 };
  return encarte;
}

/** "sim" no wrangler.jsonc libera o download das faixas e do .zip; senão é só player. */
export function downloadLiberado(env: Env): boolean {
  return String(env.DOWNLOAD_FAIXAS) === "sim";
}

function nomeAmigavel(encarte: Encarte | null, arquivo: string): string {
  const album = encarte?.album ?? "Correnteza";
  if (arquivo === "album.zip") return `${encarte?.artistas ?? "Thales Carvalho & Thayson Azevedo"} - ${album}.zip`;
  if (arquivo === "encarte.pdf") return `${album} - Encarte.pdf`;
  if (arquivo === "encarte.json") return `${album} - Encarte.json`;
  const faixa = encarte?.faixas.find((f) => `${f.id}.mp3` === arquivo);
  return faixa ? `${String(faixa.numero).padStart(2, "0")} - ${faixa.titulo}.mp3` : arquivo;
}

/** Todos os links de quem comprou, assinados e com validade. */
async function links(env: Env, base: string, encarte: Encarte, codigo: string) {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_LINKS_S;
  const apelido = await apelidoDoCodigo(env, codigo);
  const link = (tipo: TipoArquivo, arquivo: string) => linkAssinado(env, base, tipo, arquivo, apelido, expira);
  const baixar = downloadLiberado(env);
  const faixas = await Promise.all(
    encarte.faixas.map(async (f) => ({
      id: f.id,
      audio: await link("stream", `${f.id}.mp3`),
      ...(baixar ? { download: await link("download", `${f.id}.mp3`) } : {}),
    })),
  );
  return {
    expira: expira * 1000,
    faixas,
    pdf: await link("download", "encarte.pdf"),
    json: await link("stream", "encarte.json"),
    ...(baixar ? { zip: await link("download", "album.zip") } : {}),
  };
}

export async function rotaAlbum(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const encarte = await lerEncarte(env);
  if (!encarte) return erro(503, "album_nao_configurado", "Os arquivos do álbum ainda não foram enviados ao R2.");
  const base = url.origin;
  const previa = (f: Faixa) => `${base}/api/preview/${f.id}.mp3`;
  const publico = {
    album: encarte.album,
    artistas: encarte.artistas,
    preco: Number(env.PRECO),
    moeda: "BRL",
    faixas: encarte.faixas.map((f) => ({ numero: f.numero, id: f.id, titulo: f.titulo, previa: previa(f) })),
  };

  if (!lerCredenciais(request, url).bruto) {
    return json({ ...publico, acesso: false }, 200, { "Cache-Control": "public, max-age=300" });
  }
  const acesso = await verificarAcesso(request, env, ctx, url);
  if (!acesso.ok) return json({ ...publico, acesso: false, motivo: acesso.motivo }, acesso.motivo === "muitas_tentativas" ? 429 : 200);

  const l = await links(env, base, encarte, acesso.codigo);
  return json({
    ...publico,
    acesso: true,
    codigo: acesso.codigo,
    agora: Date.now(),
    linksExpiram: l.expira,
    downloadFaixas: downloadLiberado(env),
    descricao: encarte.descricao,
    faixas: encarte.faixas.map((f, i) => ({
      numero: f.numero,
      id: f.id,
      titulo: f.titulo,
      idioma: f.idioma,
      previa: previa(f),
      audio: l.faixas[i].audio,
      ...(l.faixas[i].download ? { download: l.faixas[i].download } : {}),
      creditos: f.creditos,
      cores: f.cores,
      letra: f.letra,
    })),
    encarte: { json: l.json, pdf: l.pdf, creditosGerais: encarte.creditosGerais },
    ...(l.zip ? { zip: l.zip } : {}),
  });
}

/** Links novos para o player continuar tocando depois que os anteriores expiram. */
export async function rotaLinks(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const acesso = await verificarAcesso(request, env, ctx, url);
  if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
  const encarte = await lerEncarte(env);
  if (!encarte) return erro(503, "album_nao_configurado");
  return json({ agora: Date.now(), ...(await links(env, url.origin, encarte, acesso.codigo)) });
}

export async function rotaArquivo(
  tipo: "preview" | "stream" | "download",
  nome: string,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  if (tipo === "preview") {
    if (!nomePermitido(nome, "previews")) return erro(404, "arquivo_nao_encontrado");
    if (!(await env.LIMITE_ARQUIVOS.limit({ key: `ip:${ipDe(request)}` })).success) return erro(429, "muitas_requisicoes");
    return servirDoR2(request, env.ARQUIVOS, `previews/${nome}`, { cache: "public, max-age=86400" });
  }

  if (!nomePermitido(nome, "full")) return erro(404, "arquivo_nao_encontrado");
  // só player: as faixas tocam, mas não baixam (o encarte em PDF continua liberado)
  if (!downloadLiberado(env) && (nome === "album.zip" || (tipo === "download" && nome.endsWith(".mp3")))) {
    return erro(403, "download_desativado", "O download das faixas não está disponível. Ouça pelo player do site.");
  }

  // link assinado (o que a página usa) ou, como antes, código + aparelho
  let chaveLimite: string;
  if (url.searchParams.has("s")) {
    const apelido = await conferirLink(env, tipo, nome, url);
    if (!apelido) return erro(401, "link_expirado", "Este link expirou. Recarregue a página do álbum.");
    chaveLimite = `codigo:${apelido}`;
  } else {
    const acesso = await verificarAcesso(request, env, ctx, url);
    if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
    chaveLimite = `codigo:${await apelidoDoCodigo(env, acesso.codigo)}`;
  }
  if (!(await env.LIMITE_ARQUIVOS.limit({ key: chaveLimite })).success) return erro(429, "muitas_requisicoes");
  const baixarComo = tipo === "download" ? nomeAmigavel(await lerEncarte(env), nome) : undefined;
  return servirDoR2(request, env.ARQUIVOS, `full/${nome}`, { cache: "private, max-age=1800", baixarComo });
}
