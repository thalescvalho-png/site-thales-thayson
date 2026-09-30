// Worker "correnteza": venda do álbum Correnteza (Thales Carvalho & Thayson Azevedo).
//
// POST /api/checkout                 cria o pagamento (Pix, crédito ou débito) no Mercado Pago
// POST /api/webhook/mercadopago      recebe os avisos de pagamento
// GET  /api/order/:id                situação do pedido
// GET  /api/album[?token=]           faixas e prévias; com código válido, tudo o que foi comprado
// GET  /api/preview/:arquivo         prévia pública de 15 s
// GET  /api/stream/:arquivo?token=   faixa completa, encarte.json ou PDF (com suporte a Range)
// GET  /api/download/:arquivo?token= download com nome amigável (inclui album.zip)
import { tarefaAgendada } from "./agendado";
import { rotaAlbum, rotaArquivo } from "./album";
import { rotaCheckout, rotaPedido } from "./checkout";
import { aplicarCors, cabecalhosCors } from "./cors";
import { decodificar, erro, json } from "./util";
import { rotaWebhook } from "./webhook";

async function rotear(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  const leitura = metodo === "GET" || metodo === "HEAD";

  if (pathname === "/api/checkout") return metodo === "POST" ? rotaCheckout(request, env) : erro(405, "metodo_nao_permitido");
  if (pathname === "/api/webhook/mercadopago") return metodo === "POST" ? rotaWebhook(request, env, url) : erro(405, "metodo_nao_permitido");
  if (!leitura) return erro(405, "metodo_nao_permitido");

  if (pathname === "/") return json({ servico: "Correnteza", ok: true });
  if (pathname === "/api/album") return rotaAlbum(request, env, ctx, url);

  const pedido = pathname.match(/^\/api\/order\/([^/]+)$/);
  if (pedido) return rotaPedido(request, env, decodificar(pedido[1]) ?? "");

  const arquivo = pathname.match(/^\/api\/(preview|stream|download)\/([^/]+)$/);
  if (arquivo) {
    const nome = decodificar(arquivo[2]);
    if (!nome) return erro(404, "arquivo_nao_encontrado");
    return rotaArquivo(arquivo[1] as "preview" | "stream" | "download", nome, request, env, ctx, url);
  }
  return erro(404, "nao_encontrado");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const cors = cabecalhosCors(request, env);
    if (request.method === "OPTIONS") return aplicarCors(new Response(null, { status: 204 }), cors);
    let resposta: Response;
    try {
      resposta = await rotear(request, env, ctx, url);
    } catch (e) {
      console.error("Erro inesperado:", e instanceof Error ? e.stack : e);
      resposta = erro(500, "erro_interno", "Algo deu errado. Tente de novo em instantes.");
    }
    return aplicarCors(resposta, cors);
  },

  async scheduled(_evento, env, ctx): Promise<void> {
    ctx.waitUntil(tarefaAgendada(env));
  },
} satisfies ExportedHandler<Env>;
