// Worker "correnteza": venda do álbum Correnteza (Thales Carvalho & Thayson Azevedo).
//
// POST /api/checkout                 cria o pagamento (Pix, crédito ou débito) no Mercado Pago
// POST /api/webhook/mercadopago      recebe os avisos de pagamento
// GET  /api/order/:id                situação do pedido
// GET  /api/album[?token=]           faixas e prévias; com código válido, tudo o que foi comprado
// GET  /api/links?token=             links novos das faixas (os links expiram em 30 minutos)
// GET  /api/preview/:arquivo         prévia pública de 15 s
// GET  /api/stream/:arquivo          faixa completa, encarte.json ou PDF (link assinado; suporte a Range)
// GET  /api/download/:arquivo        download com nome amigável (encarte.pdf; faixas e .zip só com DOWNLOAD_FAIXAS = "sim")
// GET  /api/aparelhos?token=         aparelhos que usam o código   POST /api/aparelhos/liberar  desconecta um
// GET|POST /api/tocando              uma reprodução por vez
// POST /api/novidades                "me avise das novidades"      POST /api/descadastrar  sair da lista
// GET|POST /api/comentarios          mural dos ouvintes            POST /api/comentarios/confirmar
// POST /api/evento                   contagem do funil, sem dado pessoal
// /api/admin/...                     moderação e resumo (senha ADMIN_SENHA)
import { rotaAdmin } from "./admin";
import { tarefaAgendada } from "./agendado";
import { rotaAlbum, rotaArquivo, rotaLinks } from "./album";
import { rotaAparelhos, rotaLiberarAparelho, rotaTocando } from "./aparelhos";
import { rotaCheckout, rotaPedido } from "./checkout";
import { rotaDescadastrar, rotaNovidades } from "./contatos";
import { aplicarCors, cabecalhosCors } from "./cors";
import { rotaEvento } from "./eventos";
import { rotaComentarios, rotaConfirmarComentario } from "./mural";
import { decodificar, erro, json } from "./util";
import { rotaWebhook } from "./webhook";

const SO_POST: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  "/api/checkout": rotaCheckout,
  "/api/aparelhos/liberar": rotaLiberarAparelho,
  "/api/novidades": rotaNovidades,
  "/api/descadastrar": rotaDescadastrar,
  "/api/comentarios/confirmar": rotaConfirmarComentario,
  "/api/evento": rotaEvento,
};

async function rotear(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  const leitura = metodo === "GET" || metodo === "HEAD";

  if (pathname === "/api/webhook/mercadopago") return metodo === "POST" ? rotaWebhook(request, env, url) : erro(405, "metodo_nao_permitido");
  if (SO_POST[pathname]) return metodo === "POST" ? SO_POST[pathname](request, env) : erro(405, "metodo_nao_permitido");
  if (pathname.startsWith("/api/admin/")) return rotaAdmin(request, env, url);
  if (pathname === "/api/tocando") return rotaTocando(request, env, ctx, url);
  if (pathname === "/api/comentarios") return rotaComentarios(request, env, ctx);
  if (!leitura) return erro(405, "metodo_nao_permitido");

  if (pathname === "/") return json({ servico: "Correnteza", ok: true });
  if (pathname === "/api/album") return rotaAlbum(request, env, ctx, url);
  if (pathname === "/api/links") return rotaLinks(request, env, ctx, url);
  if (pathname === "/api/aparelhos") return rotaAparelhos(request, env, url);

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
