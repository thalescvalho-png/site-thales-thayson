// Sala do Modo TV (Durable Object): uma por TV, com o nome do código curto que aparece na tela.
//
// A TV abre /tv no navegador, recebe um código (ex.: K7Q4MD) e se conecta aqui por WebSocket.
// O celular de quem comprou confirma o código e vira o controle remoto: os comandos passam por aqui
// e chegam à TV na hora. A TV nunca recebe o código de acesso: só os títulos, as letras e links
// assinados que vencem em VALIDADE_LINKS_TV_S, renovados por aqui enquanto o pareamento valer.
//
// Mensagens (JSON):
//   TV → sala        { tipo: "estado", faixa, t, tocando }   { tipo: "links", faixas: [i, ...] }   { tipo: "sair" }
//   sala → TV        { tipo: "album", album }   { tipo: "links", expira, links: { id: url } }
//                    { tipo: "comando", acao, faixa?, t? }   { tipo: "aviso", texto }   { tipo: "fim", motivo }
//   celular → sala   { tipo: "comando", acao: "alternar"|"tocar"|"pausar"|"anterior"|"proxima"|"ir", faixa?, t? }
//                    { tipo: "desconectar" }
//   sala → celular   { tipo: "estado", tv, faixa, t, tocando, quando }   { tipo: "aviso", texto }   { tipo: "fim", motivo }
// "ping" e "pong" mantêm a conexão viva sem acordar a sala (hibernação: parada, ela não gasta nada).
import { DurableObject } from "cloudflare:workers";
import { PREFIXO_TV, marcarTocando, quemEstaTocando, soltarVez } from "./acesso";
import { lerEncarte } from "./album";
import { apelidoDoCodigo, linkAssinado } from "./assinatura";

// ----- Tempos que você pode ajustar -----
export const VALIDADE_LINKS_TV_S = 15 * 60; // cada link de faixa enviado à TV vale 15 minutos
const ESPERA_PAREAMENTO_MS = 10 * 60_000; // o código da tela vale 10 minutos até alguém confirmar
const SEM_USO_MS = 6 * 3600_000; // TV pareada e parada por 6 horas: desconecta sozinha
const CONFERIR_VEZ_MS = 20_000; // enquanto toca, confere a cada 20 s se outro aparelho pegou a vez

type Estado = { faixa: number; t: number; tocando: boolean; quando: number };
type Sessao = {
  sala: string;
  segredo: string;
  base: string; // endereço do Worker, para montar os links das faixas
  criadoEm: number;
  ultimoUso: number;
  pareado?: { codigo: string; aparelho: string; em: number };
  estado?: Estado;
};

type Mensagem = { tipo?: string; acao?: string; faixa?: number; t?: number; tocando?: boolean; faixas?: number[] };

const ACOES = new Set(["alternar", "tocar", "pausar", "anterior", "proxima", "ir"]);

export class SalaTV extends DurableObject<Env> {
  private sessao: Sessao | null | undefined; // undefined = ainda não lida do armazenamento

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"tipo":"ping"}', '{"tipo":"pong"}'));
  }

  private async ler(): Promise<Sessao | null> {
    if (this.sessao === undefined) this.sessao = (await this.ctx.storage.get<Sessao>("sessao")) ?? null;
    return this.sessao;
  }
  private async gravar(s: Sessao): Promise<void> {
    this.sessao = s;
    await this.ctx.storage.put("sessao", s);
  }
  private vencida(s: Sessao, agora = Date.now()): boolean {
    return s.pareado ? agora - s.ultimoUso > SEM_USO_MS : agora - s.criadoEm > ESPERA_PAREAMENTO_MS;
  }
  private idTv(s: Sessao): string {
    return PREFIXO_TV + s.sala;
  }

  // ----- Chamadas do Worker (src/tv.ts) -----

  /** A TV pediu uma sala com este nome. false = o nome está em uso (o Worker sorteia outro). */
  async criar(sala: string, segredo: string, base: string): Promise<boolean> {
    const atual = await this.ler();
    if (atual && !this.vencida(atual)) return false;
    if (atual) await this.encerrar("expirou");
    const agora = Date.now();
    await this.gravar({ sala, segredo, base, criadoEm: agora, ultimoUso: agora });
    await this.ctx.storage.setAlarm(agora + ESPERA_PAREAMENTO_MS);
    return true;
  }

  /** O celular confirmou o código da tela. Uma TV só pode ser pareada por um comprador por vez. */
  async parear(codigo: string, aparelho: string): Promise<{ ok: true } | { ok: false; motivo: "sala_inexistente" | "sala_ocupada" }> {
    const s = await this.ler();
    if (!s || this.vencida(s)) return { ok: false, motivo: "sala_inexistente" };
    if (s.pareado && s.pareado.codigo !== codigo) return { ok: false, motivo: "sala_ocupada" };
    const agora = Date.now();
    s.pareado = { codigo, aparelho, em: agora };
    s.ultimoUso = agora;
    await this.gravar(s);
    await this.agendar(s);
    const album = await this.pacoteAlbum();
    for (const ws of this.ctx.getWebSockets("tv")) this.enviar(ws, album);
    return { ok: true };
  }

  /** Conexão WebSocket, já conferida pelo Worker: cabeçalho X-Papel = "tv" ou "controle". */
  async fetch(request: Request): Promise<Response> {
    const s = await this.ler();
    const papel = request.headers.get("X-Papel");
    if (!s || this.vencida(s)) return new Response("sala_inexistente", { status: 404 });
    if (papel === "tv") {
      if (request.headers.get("X-Segredo") !== s.segredo) return new Response("segredo_errado", { status: 403 });
    } else if (papel === "controle") {
      if (!s.pareado || request.headers.get("X-Codigo") !== s.pareado.codigo) return new Response("nao_pareado", { status: 403 });
    } else return new Response("papel_invalido", { status: 400 });

    const par = new WebSocketPair();
    this.ctx.acceptWebSocket(par[1], [papel]);
    if (papel === "tv") {
      // a TV chegou (ou voltou depois de cair): manda o álbum, se já houver alguém pareado
      if (s.pareado) this.enviar(par[1], await this.pacoteAlbum());
      this.avisarControles(s);
    } else {
      this.enviar(par[1], this.estadoParaControle(s));
    }
    return new Response(null, { status: 101, webSocket: par[0] });
  }

  // ----- Mensagens -----

  async webSocketMessage(ws: WebSocket, bruta: string | ArrayBuffer): Promise<void> {
    if (typeof bruta !== "string" || bruta.length > 4096) return;
    let m: Mensagem;
    try {
      m = JSON.parse(bruta);
    } catch {
      return;
    }
    const s = await this.ler();
    if (!s) {
      ws.close(4000, "fim");
      return;
    }
    const papel = this.ctx.getTags(ws)[0];
    if (papel === "tv") await this.daTv(s, ws, m);
    else if (papel === "controle") await this.doControle(s, ws, m);
  }

  private async daTv(s: Sessao, ws: WebSocket, m: Mensagem): Promise<void> {
    if (m.tipo === "estado" && s.pareado) {
      const tocava = !!s.estado?.tocando;
      s.estado = {
        faixa: Math.max(0, Math.floor(Number(m.faixa) || 0)),
        t: Math.max(0, Number(m.t) || 0),
        tocando: !!m.tocando,
        quando: Date.now(),
      };
      s.ultimoUso = Date.now();
      await this.gravar(s);
      // a TV começou a tocar: ela passa a ser a reprodução ativa da conta (os outros aparelhos pausam)
      if (s.estado.tocando && !tocava) {
        await marcarTocando(this.env, s.pareado.codigo, this.idTv(s));
        await this.agendar(s);
      }
      this.avisarControles(s);
    } else if (m.tipo === "links" && s.pareado) {
      this.enviar(ws, await this.links(s, Array.isArray(m.faixas) ? m.faixas : []));
    } else if (m.tipo === "sair") {
      await this.encerrar("tv_saiu");
    }
  }

  private async doControle(s: Sessao, ws: WebSocket, m: Mensagem): Promise<void> {
    if (m.tipo === "desconectar") {
      await this.encerrar("desconectado");
      return;
    }
    if (m.tipo !== "comando" || !ACOES.has(String(m.acao))) return;
    const tvs = this.ctx.getWebSockets("tv");
    if (!tvs.length) {
      this.enviar(ws, { tipo: "aviso", texto: "A TV está sem conexão. Confira se a página continua aberta nela." });
      return;
    }
    const comando: Record<string, unknown> = { tipo: "comando", acao: m.acao };
    if (m.faixa !== undefined) comando.faixa = Math.max(0, Math.floor(Number(m.faixa) || 0));
    if (m.t !== undefined) comando.t = Math.max(0, Number(m.t) || 0);
    for (const tv of tvs) this.enviar(tv, comando);
    s.ultimoUso = Date.now();
    await this.gravar(s);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const s = await this.ler();
    if (!s || this.ctx.getTags(ws)[0] !== "tv") return;
    // a TV saiu da rede ou fechou a página: para de contar como tocando
    if (this.ctx.getWebSockets("tv").filter((w) => w !== ws).length) return;
    if (s.estado?.tocando) {
      s.estado.tocando = false;
      await this.gravar(s);
    }
    this.avisarControles(s, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // ----- Alarme: vencimento e "uma reprodução por vez" -----

  private async agendar(s: Sessao): Promise<void> {
    const agora = Date.now();
    const vence = s.pareado ? s.ultimoUso + SEM_USO_MS : s.criadoEm + ESPERA_PAREAMENTO_MS;
    await this.ctx.storage.setAlarm(s.estado?.tocando ? Math.min(vence, agora + CONFERIR_VEZ_MS) : vence);
  }

  async alarm(): Promise<void> {
    const s = await this.ler();
    if (!s) return;
    if (this.vencida(s)) {
      await this.encerrar("expirou");
      return;
    }
    if (s.pareado && s.estado?.tocando) {
      const vez = await quemEstaTocando(this.env, s.pareado.codigo, this.idTv(s));
      if (!vez.meu) {
        s.estado.tocando = false;
        await this.gravar(s);
        const aviso = { tipo: "aviso", texto: `Pausado: começou a tocar em outro aparelho (${vez.outro ?? "sem nome"}).` };
        for (const tv of this.ctx.getWebSockets("tv")) {
          this.enviar(tv, { tipo: "comando", acao: "pausar" });
          this.enviar(tv, aviso);
        }
        for (const c of this.ctx.getWebSockets("controle")) this.enviar(c, aviso);
        this.avisarControles(s);
      }
    }
    await this.agendar(s);
  }

  // ----- Ajudantes -----

  private async encerrar(motivo: string): Promise<void> {
    const s = await this.ler();
    if (s?.pareado) await soltarVez(this.env, s.pareado.codigo, this.idTv(s)).catch(() => {});
    for (const ws of this.ctx.getWebSockets()) {
      this.enviar(ws, { tipo: "fim", motivo });
      try {
        ws.close(4000, "fim");
      } catch {}
    }
    this.sessao = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private enviar(ws: WebSocket, dados: unknown): void {
    try {
      ws.send(JSON.stringify(dados));
    } catch {}
  }

  private estadoParaControle(s: Sessao) {
    const e = s.estado;
    return {
      tipo: "estado",
      tv: this.ctx.getWebSockets("tv").length > 0,
      faixa: e?.faixa ?? 0,
      t: e?.t ?? 0,
      tocando: !!e?.tocando,
      quando: e?.quando ?? Date.now(),
      agora: Date.now(),
    };
  }

  private avisarControles(s: Sessao, saindo?: WebSocket): void {
    const estado = this.estadoParaControle(s);
    if (saindo) estado.tv = this.ctx.getWebSockets("tv").some((w) => w !== saindo);
    for (const c of this.ctx.getWebSockets("controle")) this.enviar(c, estado);
  }

  /** Títulos, cores, durações e letras sincronizadas (.lrc) de todas as faixas. Nunca o código de acesso. */
  private async pacoteAlbum() {
    const encarte = await lerEncarte(this.env);
    if (!encarte) return { tipo: "aviso", texto: "O álbum ainda não está disponível." };
    const letras = await Promise.all(
      encarte.faixas.map(async (f) => {
        const objeto = await this.env.ARQUIVOS.get(`lyrics/${f.id}.lrc`);
        return objeto ? objeto.text() : null;
      }),
    );
    return {
      tipo: "album",
      album: {
        titulo: encarte.album,
        artistas: encarte.artistas,
        faixas: encarte.faixas.map((f, i) => ({
          numero: f.numero,
          id: f.id,
          titulo: f.titulo,
          idioma: f.idioma,
          tom: f.cores?.tom,
          duracao: f.duracao,
          lrc: letras[i],
        })),
      },
    };
  }

  /** Links assinados das faixas pedidas (a TV pede a atual e a seguinte). */
  private async links(s: Sessao, pedidas: number[]) {
    const codigo = s.pareado!.codigo;
    // o código pode ter sido desativado depois do pareamento
    const ativo = await this.env.DB.prepare("SELECT ativo FROM codigos WHERE codigo = ?1").bind(codigo).first<{ ativo: number }>();
    if (!ativo?.ativo) {
      await this.encerrar("codigo_desativado");
      return { tipo: "fim", motivo: "codigo_desativado" };
    }
    const encarte = await lerEncarte(this.env);
    if (!encarte) return { tipo: "aviso", texto: "O álbum ainda não está disponível." };
    const expira = Math.floor(Date.now() / 1000) + VALIDADE_LINKS_TV_S;
    const apelido = await apelidoDoCodigo(this.env, codigo);
    const links: Record<string, string> = {};
    for (const i of pedidas.slice(0, 3)) {
      const f = encarte.faixas[Math.floor(Number(i))];
      if (f) links[f.id] = await linkAssinado(this.env, s.base, "stream", `${f.id}.mp3`, apelido, expira);
    }
    return { tipo: "links", expira: expira * 1000, links };
  }
}
