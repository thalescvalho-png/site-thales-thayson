// Entrega arquivos do R2 com suporte a Range (pular para qualquer ponto da música)
// e, nos downloads, com nome amigável ("01 - Clareira.mp3").
import { erro } from "./util";

const FAIXA = /^\d{2}-[a-z0-9-]+\.mp3$/;
const EXTRAS_COMPLETOS = new Set(["encarte.pdf", "encarte.json", "album.zip"]);
const TIPOS: Record<string, string> = {
  mp3: "audio/mpeg",
  pdf: "application/pdf",
  json: "application/json; charset=utf-8",
  zip: "application/zip",
};

/** Só nomes desta lista podem ser pedidos: nada de caminhos arbitrários no R2. */
export function nomePermitido(nome: string, pasta: "previews" | "full"): boolean {
  return FAIXA.test(nome) || (pasta === "full" && EXTRAS_COMPLETOS.has(nome));
}

function disposicao(nome: string): string {
  const ascii = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function servirDoR2(
  request: Request,
  bucket: R2Bucket,
  chave: string,
  opcoes: { cache: string; baixarComo?: string },
): Promise<Response> {
  const headers = new Headers();
  const preencher = (objeto: R2Object) => {
    objeto.writeHttpMetadata(headers);
    if (!headers.get("Content-Type")) headers.set("Content-Type", TIPOS[chave.split(".").pop() ?? ""] ?? "application/octet-stream");
    headers.set("ETag", objeto.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", opcoes.cache);
    if (opcoes.baixarComo) headers.set("Content-Disposition", disposicao(opcoes.baixarComo));
  };

  if (request.method === "HEAD") {
    const info = await bucket.head(chave);
    if (!info) return erro(404, "arquivo_nao_encontrado");
    preencher(info);
    headers.set("Content-Length", String(info.size));
    return new Response(null, { headers });
  }

  // só atende pedidos de um trecho só ("bytes=100-199", "bytes=100-", "bytes=-500"); outros formatos recebem o arquivo inteiro
  const trechoPedido = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range")?.trim() ?? "");
  const pediuTrecho = trechoPedido !== null && (trechoPedido[1] !== "" || trechoPedido[2] !== "");
  let objeto: R2ObjectBody | R2Object | null;
  try {
    objeto = await bucket.get(chave, { range: pediuTrecho ? request.headers : undefined, onlyIf: request.headers });
  } catch {
    // trecho pedido fora do tamanho do arquivo
    const info = await bucket.head(chave);
    if (!info) return erro(404, "arquivo_nao_encontrado");
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
  }
  if (!objeto) return erro(404, "arquivo_nao_encontrado");
  preencher(objeto);

  if (!("body" in objeto)) {
    const condicional = request.headers.has("If-None-Match") || request.headers.has("If-Modified-Since");
    return new Response(null, { status: condicional ? 304 : 412, headers });
  }

  if (pediuTrecho && trechoPedido[1] !== "" && Number(trechoPedido[1]) >= objeto.size) {
    await objeto.body.cancel();
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${objeto.size}` } });
  }
  if (pediuTrecho && objeto.range) {
    const trecho = objeto.range as { offset?: number; length?: number; suffix?: number };
    let inicio: number;
    let tamanho: number;
    if (trecho.suffix !== undefined) {
      tamanho = Math.min(trecho.suffix, objeto.size);
      inicio = objeto.size - tamanho;
    } else {
      inicio = trecho.offset ?? 0;
      tamanho = trecho.length ?? objeto.size - inicio;
    }
    headers.set("Content-Range", `bytes ${inicio}-${inicio + tamanho - 1}/${objeto.size}`);
    headers.set("Content-Length", String(tamanho));
    return new Response(objeto.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(objeto.size));
  return new Response(objeto.body, { headers });
}
