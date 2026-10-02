-- Configurações internas geradas pelo próprio backend (ex.: a chave que assina os links das faixas)
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Uma reprodução por vez: o aparelho que deu play por último
ALTER TABLE codigos ADD COLUMN tocando_aparelho TEXT;
ALTER TABLE codigos ADD COLUMN tocando_em TEXT;

-- Aparelhos que o próprio comprador desconectou (o limite de trocas por mês conta daqui)
CREATE TABLE aparelhos_liberados (
  codigo       TEXT NOT NULL,
  aparelho     TEXT NOT NULL,
  descricao    TEXT,
  liberado_em  TEXT NOT NULL,
  por_aparelho TEXT                           -- quem pediu a liberação
);
CREATE INDEX aparelhos_liberados_codigo ON aparelhos_liberados (codigo, liberado_em);

-- De onde veio cada pedido (link da bio, Stories, DM...)
ALTER TABLE pedidos ADD COLUMN origem TEXT;

-- Lista única de e-mails (compra, "me avise" depois da prévia e mural)
CREATE TABLE contatos (
  email            TEXT PRIMARY KEY,
  nome             TEXT,
  origem           TEXT NOT NULL,             -- onde entrou primeiro: compra, previa, mural
  novidades        INTEGER NOT NULL DEFAULT 0, -- 1 = aceitou receber novidades
  novidades_em     TEXT,                      -- data e hora do aceite
  novidades_origem TEXT,                      -- onde aceitou: compra, previa, mural
  comprador        INTEGER NOT NULL DEFAULT 0,
  descadastrado_em TEXT,                      -- preenchido = nunca mais enviar novidades
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL
);
CREATE INDEX contatos_novidades ON contatos (novidades, descadastrado_em);

-- quem já comprou ou pediu novidades na compra entra na lista
INSERT INTO contatos (email, origem, novidades, novidades_em, novidades_origem, comprador, criado_em, atualizado_em)
SELECT email, 'compra',
       MAX(novidades),
       MIN(CASE WHEN novidades = 1 THEN criado_em END),
       CASE WHEN MAX(novidades) = 1 THEN 'compra' END,
       MAX(CASE WHEN status = 'approved' THEN 1 ELSE 0 END),
       MIN(criado_em), MAX(atualizado_em)
  FROM pedidos
 WHERE status = 'approved' OR novidades = 1
 GROUP BY email;

-- Mural dos ouvintes
CREATE TABLE comentarios (
  id               TEXT PRIMARY KEY,
  faixa            TEXT,                      -- id da faixa (ex.: 07-lugubre) ou vazio = sobre o álbum
  nome             TEXT NOT NULL,
  cidade           TEXT,
  texto            TEXT NOT NULL,
  email            TEXT NOT NULL,             -- nunca aparece no site
  apoiador         INTEGER NOT NULL DEFAULT 0, -- comprou o álbum
  status           TEXT NOT NULL,             -- confirmar_email, pendente, publicado, recusado
  confirmacao      TEXT,                      -- segredo do link de confirmação do e-mail
  criado_em        TEXT NOT NULL,
  publicado_em     TEXT
);
CREATE INDEX comentarios_status ON comentarios (status, criado_em);
CREATE INDEX comentarios_email ON comentarios (email, criado_em);

-- Contagem diária de etapas do funil, sem nenhum dado pessoal
CREATE TABLE eventos_dia (
  dia     TEXT NOT NULL,                      -- AAAA-MM-DD (horário de Brasília)
  evento  TEXT NOT NULL,                      -- visita, previa, abrir_compra, pagamento, compra, ...
  origem  TEXT NOT NULL,                      -- instagram/bio, instagram/stories, whatsapp, direto...
  total   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, evento, origem)
);
