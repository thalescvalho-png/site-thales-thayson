// CORS: só o site da dupla (SITE_ORIGENS) pode chamar a API pelo navegador.

export function origensPermitidas(env: Env): string[] {
  return env.SITE_ORIGENS.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
}

export function origemPermitida(request: Request, env: Env): boolean {
  const origem = request.headers.get("Origin");
  return origem !== null && origensPermitidas(env).includes(origem);
}

export function cabecalhosCors(request: Request, env: Env): Record<string, string> {
  if (!origemPermitida(request, env)) return {};
  return {
    "Access-Control-Allow-Origin": request.headers.get("Origin")!,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Aparelho, Range, Authorization",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
    "Access-Control-Max-Age": "86400",
  };
}

export function aplicarCors(resposta: Response, cabecalhos: Record<string, string>): Response {
  const saida = new Response(resposta.body, resposta);
  for (const [nome, valor] of Object.entries(cabecalhos)) saida.headers.set(nome, valor);
  const vary = saida.headers.get("Vary");
  if (!vary?.includes("Origin")) saida.headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  return saida;
}
