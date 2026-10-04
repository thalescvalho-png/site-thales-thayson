// Conversa com a API do Mercado Pago.
import { iguaisSeguro } from "./util";

// MP_API_BASE só existe para testes locais (npm run dev); em produção fica vazio.
const api = (env: Env) => env.MP_API_BASE || "https://api.mercadopago.com";

export type PagamentoMP = {
  id: number;
  status: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
};

export async function criarPagamento(
  env: Env,
  corpo: Record<string, unknown>,
  chaveIdempotencia: string,
): Promise<{ ok: true; pagamento: PagamentoMP } | { ok: false; status: number; mensagem: string }> {
  const resposta = await fetch(`${api(env)}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      // evita cobrar duas vezes se o mesmo pedido for reenviado
      "X-Idempotency-Key": chaveIdempotencia,
    },
    body: JSON.stringify(corpo),
  });
  const dados = (await resposta.json().catch(() => ({}))) as PagamentoMP & { message?: string; cause?: unknown };
  if (!resposta.ok) {
    // o corpo do erro (sem dados do cartão) e o x-request-id ajudam o suporte do Mercado Pago a achar a falha
    console.error(
      `Resposta do Mercado Pago ao criar o pagamento ${chaveIdempotencia}: ${resposta.status}`,
      `x-request-id=${resposta.headers.get("x-request-id") ?? "-"}`,
      JSON.stringify(dados).slice(0, 800),
    );
    return { ok: false, status: resposta.status, mensagem: dados.message ?? `HTTP ${resposta.status}` };
  }
  return { ok: true, pagamento: dados };
}

export async function consultarPagamento(env: Env, id: string): Promise<PagamentoMP | null> {
  const resposta = await fetch(`${api(env)}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`Mercado Pago respondeu ${resposta.status} ao consultar o pagamento ${id}`);
  return resposta.json<PagamentoMP>();
}

/**
 * Valida o cabeçalho x-signature ("ts=...,v1=...") dos avisos do Mercado Pago.
 * Mensagem assinada: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (partes ausentes são omitidas),
 * HMAC-SHA256 com a chave secreta do webhook, em hexadecimal.
 */
export async function assinaturaValida(request: Request, url: URL, segredo: string): Promise<boolean> {
  const partes = new Map(
    (request.headers.get("x-signature") ?? "").split(",").map((p) => {
      const [chave, ...valor] = p.split("=");
      return [chave.trim(), valor.join("=").trim()] as const;
    }),
  );
  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return false;

  const idBruto = url.searchParams.get("data.id");
  const dataId = idBruto && /^[a-z0-9]+$/i.test(idBruto) ? idBruto.toLowerCase() : idBruto;
  const requestId = request.headers.get("x-request-id");
  let mensagem = "";
  if (dataId) mensagem += `id:${dataId};`;
  if (requestId) mensagem += `request-id:${requestId};`;
  mensagem += `ts:${ts};`;

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  const hex = Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisSeguro(hex, v1.toLowerCase());
}
