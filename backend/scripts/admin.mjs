#!/usr/bin/env node
// Comandos de administração. Rodam na sua máquina, com o seu login da Cloudflare (npx wrangler login).
//
//   npm run codigo -- [--email voce@exemplo.com] [--aparelhos 5]   cria um código de acesso de teste
//   npm run pedidos -- [--quantos 20]                               últimos pedidos
//   npm run aparelhos -- CODIGO                                     aparelhos que já usaram o código
//   npm run liberar-aparelhos -- CODIGO                             zera a lista (comprador trocou de celular)
//   npm run desativar-codigo -- CODIGO                              o código deixa de funcionar
//   npm run exportar-emails -- [--compradores | --previa]            lista de novidades (com o link de descadastro)
//   npm run funil -- [--dias 30]                                    funil e vendas por origem
//   npm run comentarios -- [--status pendente]                      comentários do mural
//   npm run publicar-comentario -- ID                               publica um comentário
//   npm run apagar-comentario -- ID                                 apaga um comentário
//
// Acrescente --local para usar o banco de testes do "npm run dev" em vez do banco de verdade.
import { execFileSync } from "node:child_process";
import { createHmac, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVADO = process.env.CORRENTEZA_PRIVADO ?? resolve(BACKEND, "../../correnteza-privado");
const BANCO = "correnteza";
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const [comando, ...args] = process.argv.slice(2);
const local = args.includes("--local");
const opcao = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const primeiroArgumento = () =>
  args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--email", "--aparelhos", "--quantos", "--dias", "--status"].includes(args[i - 1])));

function sql(consulta) {
  const saida = execFileSync("npx", ["wrangler", "d1", "execute", BANCO, local ? "--local" : "--remote", "--json", "--command", consulta], {
    cwd: BACKEND,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(saida)[0]?.results ?? [];
}
const texto = (valor) => `'${String(valor).replace(/'/g, "''")}'`;

function normalizarCodigo(bruto) {
  const limpo = String(bruto ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo.length !== 16 || [...limpo].some((c) => !ALFABETO.includes(c))) {
    console.error(`Código inválido: "${bruto ?? ""}". Use o formato XXXX-XXXX-XXXX-XXXX.`);
    process.exit(1);
  }
  return limpo.match(/.{4}/g).join("-");
}

function paginaAlbum() {
  const config = readFileSync(join(BACKEND, "wrangler.jsonc"), "utf8");
  return config.match(/"PAGINA_ALBUM"\s*:\s*"([^"]+)"/)?.[1] ?? "";
}

function idDoComentario() {
  const id = primeiroArgumento();
  if (!/^[A-Za-z0-9_-]{16}$/.test(id ?? "")) {
    console.error("Informe o id do comentário (aparece entre colchetes em npm run comentarios).");
    process.exit(1);
  }
  return id;
}

const comandos = {
  codigo() {
    const email = opcao("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error(`E-mail inválido: ${email}`);
    const aparelhos = opcao("aparelhos");
    if (aparelhos && !/^\d{1,3}$/.test(aparelhos)) throw new Error("--aparelhos precisa ser um número");
    const codigo = Array.from({ length: 16 }, () => ALFABETO[randomInt(32)]).join("").match(/.{4}/g).join("-");
    sql(
      `INSERT INTO codigos (codigo, pedido_id, email, origem, limite_aparelhos, criado_em)
       VALUES (${texto(codigo)}, NULL, ${email ? texto(email) : "NULL"}, 'teste', ${aparelhos ?? "NULL"}, ${texto(new Date().toISOString())})`,
    );
    const link = new URL(paginaAlbum());
    link.searchParams.set("codigo", codigo);
    console.log(`\nCódigo de teste criado${local ? " (banco LOCAL)" : ""}: ${codigo}`);
    console.log(`Link para a página do álbum: ${link}`);
    console.log(`Teste rápido da API: <endereço do Worker>/api/album?token=${codigo}&aparelho=meu-teste-1\n`);
  },

  pedidos() {
    const quantos = Number(opcao("quantos") ?? 20) || 20;
    const linhas = sql(
      `SELECT substr(id, 1, 8) AS pedido, email, status, metodo, valor, substr(criado_em, 1, 16) AS criado,
              substr(pago_em, 1, 16) AS pago, codigo, CASE WHEN email_enviado_em IS NULL THEN 'não' ELSE 'sim' END AS email_enviado
         FROM pedidos ORDER BY criado_em DESC LIMIT ${quantos}`,
    );
    if (!linhas.length) console.log("Nenhum pedido ainda.");
    else console.table(linhas);
  },

  aparelhos() {
    const codigo = normalizarCodigo(primeiroArgumento());
    const [info] = sql(`SELECT codigo, email, origem, ativo, limite_aparelhos FROM codigos WHERE codigo = ${texto(codigo)}`);
    if (!info) return console.log("Código não encontrado.");
    console.table([info]);
    const linhas = sql(
      `SELECT substr(aparelho, 1, 10) AS aparelho, descricao, substr(primeiro_uso, 1, 16) AS primeiro_uso, substr(ultimo_uso, 1, 16) AS ultimo_uso
         FROM aparelhos WHERE codigo = ${texto(codigo)} ORDER BY primeiro_uso`,
    );
    if (!linhas.length) console.log("Nenhum aparelho usou este código ainda.");
    else console.table(linhas);
  },

  "liberar-aparelhos"() {
    const codigo = normalizarCodigo(primeiroArgumento());
    const [{ total }] = sql(`SELECT COUNT(*) AS total FROM aparelhos WHERE codigo = ${texto(codigo)}`);
    sql(`DELETE FROM aparelhos WHERE codigo = ${texto(codigo)}`);
    console.log(`${total} aparelho(s) liberado(s) para o código ${codigo}. Pode levar até 5 minutos para valer em todo lugar.`);
  },

  desativar() {
    const codigo = normalizarCodigo(primeiroArgumento());
    sql(`UPDATE codigos SET ativo = 0 WHERE codigo = ${texto(codigo)}`);
    console.log(`Código ${codigo} desativado. Pode levar até 5 minutos para valer em todo lugar.`);
  },

  "exportar-emails"() {
    // mesma assinatura do backend (src/assinatura.ts): HMAC-SHA256 com a chave guardada na tabela config
    const [config] = sql("SELECT valor FROM config WHERE chave = 'chave_links'");
    if (!config) throw new Error("A chave de assinatura ainda não existe. Ela é criada na primeira visita à página do álbum.");
    const descadastro = (email) => {
      const chave = createHmac("sha256", config.valor).update(`descadastro:${email}`).digest("base64url").slice(0, 24);
      const link = new URL("descadastro.html", paginaAlbum());
      link.searchParams.set("email", email);
      link.searchParams.set("chave", chave);
      return link.toString();
    };
    const filtro = args.includes("--compradores") ? "AND comprador = 1" : args.includes("--previa") ? "AND comprador = 0" : "";
    const linhas = sql(
      `SELECT email, COALESCE(nome, '') AS nome, comprador, origem, substr(novidades_em, 1, 10) AS aceite_em
         FROM contatos WHERE novidades = 1 AND descadastrado_em IS NULL ${filtro} ORDER BY novidades_em`,
    );
    const pasta = join(PRIVADO, "exportacoes");
    mkdirSync(pasta, { recursive: true });
    const arquivo = join(pasta, `novidades-${new Date().toISOString().slice(0, 10)}.csv`);
    const campo = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [
      "email,nome,comprador,origem,aceite_em,link_descadastro",
      ...linhas.map((l) => [l.email, l.nome, l.comprador ? "sim" : "nao", l.origem, l.aceite_em ?? "", descadastro(l.email)].map(campo).join(",")),
    ];
    writeFileSync(arquivo, csv.join("\n") + "\n");
    console.log(`${linhas.length} e-mail(s) exportado(s) para ${arquivo}`);
    console.log("Só entra quem marcou a caixa de novidades e não se descadastrou. Coloque o link_descadastro no rodapé de cada envio.");
  },

  funil() {
    const dias = Number(opcao("dias") ?? 30) || 30;
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();
    console.log(`\nÚltimos ${dias} dias${local ? " (banco LOCAL)" : ""}\n\nEtapas do funil (por origem):`);
    const funil = sql(
      `SELECT evento, origem, SUM(total) AS total FROM eventos_dia WHERE dia >= ${texto(desde.slice(0, 10))}
        GROUP BY evento, origem ORDER BY evento, total DESC`,
    );
    if (!funil.length) console.log("Nenhum evento ainda.");
    else console.table(funil);
    console.log("\nVendas aprovadas por origem:");
    const vendas = sql(
      `SELECT COALESCE(origem, 'direto') AS origem, COUNT(*) AS pedidos, ROUND(SUM(valor), 2) AS valor
         FROM pedidos WHERE status = 'approved' AND pago_em > ${texto(desde)} GROUP BY 1 ORDER BY pedidos DESC`,
    );
    if (!vendas.length) console.log("Nenhuma venda no período.");
    else console.table(vendas);
  },

  comentarios() {
    const status = opcao("status") ?? "pendente";
    const linhas = sql(
      `SELECT id, COALESCE(faixa, 'álbum') AS sobre, nome, cidade, CASE apoiador WHEN 1 THEN 'sim' ELSE '' END AS apoiador,
              email, substr(criado_em, 1, 16) AS criado, texto
         FROM comentarios WHERE status = ${texto(status)} ORDER BY criado_em DESC LIMIT 50`,
    );
    if (!linhas.length) return console.log(`Nenhum comentário com status "${status}".`);
    for (const c of linhas) {
      console.log(`\n[${c.id}] ${c.nome}${c.cidade ? ` (${c.cidade})` : ""} · ${c.sobre}${c.apoiador ? " · apoiador" : ""} · ${c.criado} · ${c.email}`);
      console.log(`  ${c.texto.replace(/\n/g, "\n  ")}`);
    }
    console.log("\nPublicar: npm run publicar-comentario -- ID    Apagar: npm run apagar-comentario -- ID");
  },

  "publicar-comentario"() {
    const id = idDoComentario();
    sql(`UPDATE comentarios SET status = 'publicado', confirmacao = NULL, publicado_em = COALESCE(publicado_em, ${texto(new Date().toISOString())}) WHERE id = ${texto(id)}`);
    console.log(`Comentário ${id} publicado (aparece no mural em até 1 minuto).`);
  },

  "apagar-comentario"() {
    const id = idDoComentario();
    sql(`DELETE FROM comentarios WHERE id = ${texto(id)}`);
    console.log(`Comentário ${id} apagado.`);
  },
};

const executar = comandos[comando];
if (!executar) {
  console.log(
    "Comandos: codigo, pedidos, aparelhos, liberar-aparelhos, desativar, exportar-emails, funil, comentarios, publicar-comentario, apagar-comentario (veja o início deste arquivo).",
  );
  process.exit(1);
}
try {
  executar();
} catch (e) {
  console.error(`Erro: ${e.stderr?.toString().trim() || e.message}`);
  process.exit(1);
}
