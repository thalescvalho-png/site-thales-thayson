// Assinaturas: links das faixas que expiram e links de descadastro que não podem ser forjados.
//
// A chave secreta é criada sozinha na primeira vez que o backend precisa dela e fica na tabela
// config do D1 (nunca no código nem no Git). Trocar a chave invalida todos os links já enviados.
import { base64url, idAleatorio, iguaisSeguro } from "./util";

let chave: CryptoKey | null = null;

async function chaveHmac(env: Env): Promise<CryptoKey> {
  if (chave) return chave;
  const ler = () => env.DB.prepare("SELECT valor FROM config WHERE chave = 'chave_links'").first<{ valor: string }>();
  let linha = await ler();
  if (!linha) {
    await env.DB.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES ('chave_links', ?1)").bind(idAleatorio(32)).run();
    linha = await ler();
  }
  chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(linha!.valor), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return chave;
}

export async function assinar(env: Env, texto: string, tamanho = 32): Promise<string> {
  const bytes = await crypto.subtle.sign("HMAC", await chaveHmac(env), new TextEncoder().encode(texto));
  return base64url(new Uint8Array(bytes)).slice(0, tamanho);
}

export async function assinaturaConfere(env: Env, texto: string, recebida: string, tamanho = 32): Promise<boolean> {
  return iguaisSeguro(await assinar(env, texto, tamanho), recebida);
}

// ----- Links das faixas -----
// /api/stream/01-clareira.mp3?k=...&e=...&s=...
//   k = apelido do código (não revela o código), e = validade (segundos Unix), s = assinatura
// Quem copiar o link de dentro do navegador só consegue usá-lo por pouco tempo.
export const VALIDADE_LINKS_S = 30 * 60;

export type TipoArquivo = "stream" | "download";

export function apelidoDoCodigo(env: Env, codigo: string): Promise<string> {
  return assinar(env, `codigo:${codigo}`, 16);
}

export async function linkAssinado(env: Env, base: string, tipo: TipoArquivo, arquivo: string, apelido: string, expira: number): Promise<string> {
  const s = await assinar(env, `${tipo}|${arquivo}|${apelido}|${expira}`);
  return `${base}/api/${tipo}/${encodeURIComponent(arquivo)}?k=${apelido}&e=${expira}&s=${s}`;
}

/** Confere um link assinado; devolve o apelido do código (para o limite de pedidos) ou null. */
export async function conferirLink(env: Env, tipo: TipoArquivo, arquivo: string, url: URL): Promise<string | null> {
  const k = url.searchParams.get("k") ?? "";
  const e = Number(url.searchParams.get("e"));
  const s = url.searchParams.get("s") ?? "";
  if (!/^[A-Za-z0-9_-]{16}$/.test(k) || !Number.isInteger(e) || e * 1000 < Date.now()) return null;
  return (await assinaturaConfere(env, `${tipo}|${arquivo}|${k}|${e}`, s)) ? k : null;
}

// ----- Descadastro da lista de e-mails -----
export function chaveDescadastro(env: Env, email: string): Promise<string> {
  return assinar(env, `descadastro:${email.toLowerCase()}`, 24);
}
