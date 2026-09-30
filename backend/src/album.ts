// GET /api/album            -> faixas e prévias (público)
// GET /api/album?token=...  -> também áudio completo, letras, encarte (JSON e PDF) e o .zip
// GET /api/preview|stream|download/:arquivo
import { lerCredenciais, respostaDeRecusa, verificarAcesso } from "./acesso";
import { nomePermitido, servirDoR2 } from "./arquivos";
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

function nomeAmigavel(encarte: Encarte | null, arquivo: string): string {
  const album = encarte?.album ?? "Correnteza";
  if (arquivo === "album.zip") return `${encarte?.artistas ?? "Thales Carvalho & Thayson Azevedo"} - ${album}.zip`;
  if (arquivo === "encarte.pdf") return `${album} - Encarte.pdf`;
  if (arquivo === "encarte.json") return `${album} - Encarte.json`;
  const faixa = encarte?.faixas.find((f) => `${f.id}.mp3` === arquivo);
  return faixa ? `${String(faixa.numero).padStart(2, "0")} - ${faixa.titulo}.mp3` : arquivo;
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

  const q = `?token=${encodeURIComponent(acesso.codigo)}&aparelho=${encodeURIComponent(acesso.aparelho)}`;
  return json({
    ...publico,
    acesso: true,
    codigo: acesso.codigo,
    descricao: encarte.descricao,
    faixas: encarte.faixas.map((f) => ({
      numero: f.numero,
      id: f.id,
      titulo: f.titulo,
      idioma: f.idioma,
      previa: previa(f),
      audio: `${base}/api/stream/${f.id}.mp3${q}`,
      download: `${base}/api/download/${f.id}.mp3${q}`,
      creditos: f.creditos,
      cores: f.cores,
      letra: f.letra,
    })),
    encarte: {
      json: `${base}/api/stream/encarte.json${q}`,
      pdf: `${base}/api/download/encarte.pdf${q}`,
      creditosGerais: encarte.creditosGerais,
    },
    zip: `${base}/api/download/album.zip${q}`,
  });
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
  const acesso = await verificarAcesso(request, env, ctx, url);
  if (!acesso.ok) return respostaDeRecusa(acesso.motivo);
  if (!(await env.LIMITE_ARQUIVOS.limit({ key: `codigo:${acesso.codigo}` })).success) return erro(429, "muitas_requisicoes");
  const baixarComo = tipo === "download" ? nomeAmigavel(await lerEncarte(env), nome) : undefined;
  return servirDoR2(request, env.ARQUIVOS, `full/${nome}`, { cache: "private, max-age=86400", baixarComo });
}
