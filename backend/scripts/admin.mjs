#!/usr/bin/env node
// Comandos de administração. Rodam na sua máquina, com o seu login da Cloudflare (npx wrangler login).
//
//   npm run codigo -- [--email voce@exemplo.com] [--aparelhos 5]   cria um código de acesso de teste
//   npm run pedidos -- [--quantos 20]                               últimos pedidos
//   npm run aparelhos -- CODIGO                                     aparelhos que já usaram o código
//   npm run liberar-aparelhos -- CODIGO                             zera a lista (comprador trocou de celular)
//   npm run desativar-codigo -- CODIGO                              o código deixa de funcionar
//   npm run exportar-emails -- [--todos]                            e-mails de quem aceitou receber novidades
//
// Acrescente --local para usar o banco de testes do "npm run dev" em vez do banco de verdade.
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
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
const primeiroArgumento = () => args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--email", "--aparelhos", "--quantos"].includes(args[i - 1])));

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
    const todos = args.includes("--todos");
    const linhas = sql(
      `SELECT email, substr(MIN(criado_em), 1, 10) AS primeiro_pedido, substr(MAX(pago_em), 1, 10) AS ultima_compra
         FROM pedidos WHERE novidades = 1 ${todos ? "" : "AND pago_em IS NOT NULL"}
        GROUP BY email ORDER BY primeiro_pedido`,
    );
    const pasta = join(PRIVADO, "exportacoes");
    mkdirSync(pasta, { recursive: true });
    const arquivo = join(pasta, `novidades-${new Date().toISOString().slice(0, 10)}.csv`);
    const csv = ["email,primeiro_pedido,ultima_compra", ...linhas.map((l) => [l.email, l.primeiro_pedido ?? "", l.ultima_compra ?? ""].join(","))];
    writeFileSync(arquivo, csv.join("\n") + "\n");
    console.log(`${linhas.length} e-mail(s) exportado(s) para ${arquivo}`);
    if (!todos) console.log("(só compras aprovadas; use --todos para incluir quem marcou a opção mas não concluiu o pagamento)");
  },
};

const executar = comandos[comando];
if (!executar) {
  console.log("Comandos: codigo, pedidos, aparelhos, liberar-aparelhos, desativar, exportar-emails (veja o início deste arquivo).");
  process.exit(1);
}
try {
  executar();
} catch (e) {
  console.error(`Erro: ${e.stderr?.toString().trim() || e.message}`);
  process.exit(1);
}
