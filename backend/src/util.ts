// Pequenas ferramentas usadas em todo o backend.

// 32 símbolos fáceis de ler (sem 0/O e 1/I), usados nos códigos de acesso
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function json(dados: unknown, status = 200, extras: HeadersInit = {}): Response {
  const headers = new Headers(extras);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(dados), { status, headers });
}

export function erro(status: number, codigo: string, mensagem?: string): Response {
  return json(mensagem ? { erro: codigo, mensagem } : { erro: codigo }, status);
}

export function agora(): string {
  return new Date().toISOString();
}

export function ipDe(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "sem-ip";
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Identificador aleatório e impossível de adivinhar (128 bits), seguro para URLs. */
export function idAleatorio(bytes = 16): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Dia no horário de Brasília (AAAA-MM-DD). */
export function diaBrasilia(ms = Date.now()): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Texto de formulário: sem caracteres de controle, espaços repetidos nem pontas; corta no limite. */
export function limparTexto(valor: unknown, limite: number, multilinha = false): string {
  let texto = String(valor ?? "").normalize("NFC");
  texto = multilinha
    ? texto.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : texto.replace(/\s+/g, " ");
  return texto.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim().slice(0, limite);
}

/** Origem de uma visita ("instagram/bio", "whatsapp"...): só letras, números e . _ / - */
export function limparOrigem(valor: unknown): string {
  const origem = String(valor ?? "").toLowerCase().replace(/[^a-z0-9._/-]/g, "").slice(0, 40);
  return origem || "direto";
}

/** Código de acesso no formato XXXX-XXXX-XXXX-XXXX (80 bits aleatórios). */
export function gerarCodigo(): string {
  const aleatorio = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(aleatorio, (b) => ALFABETO[b & 31]).join("").match(/.{4}/g)!.join("-");
}

/** Aceita o código com ou sem hífens/espaços e em minúsculas; devolve null se não for válido. */
export function normalizarCodigo(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const limpo = bruto.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo.length !== 16 || [...limpo].some((c) => !ALFABETO.includes(c))) return null;
  return limpo.match(/.{4}/g)!.join("-");
}

export function emailValido(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Lê o corpo JSON recusando corpos grandes demais (proteção contra abuso). */
export async function lerJson<T>(request: Request, limiteBytes = 16_384): Promise<T | null> {
  if (Number(request.headers.get("Content-Length") ?? "0") > limiteBytes) return null;
  const texto = await request.text();
  if (texto.length > limiteBytes) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

/** Compara textos sem vazar, pelo tempo de resposta, onde eles diferem. */
export function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export function decodificar(trecho: string): string | null {
  try {
    return decodeURIComponent(trecho);
  } catch {
    return null;
  }
}
