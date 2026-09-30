// Segredos cadastrados com `npx wrangler secret put NOME`.
// Ficam fora do código e do Git; enquanto não forem cadastrados, o backend funciona em modo limitado.
interface Env {
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  // Só para testes locais (arquivo .dev.vars): apontam para um Mercado Pago/Resend de mentira.
  MP_API_BASE?: string;
  RESEND_API_BASE?: string;
}
