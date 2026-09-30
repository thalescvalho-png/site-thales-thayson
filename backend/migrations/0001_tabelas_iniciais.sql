-- Pedidos de compra (um por tentativa de pagamento)
CREATE TABLE pedidos (
  id              TEXT PRIMARY KEY,           -- identificador aleatório, também usado como external_reference no Mercado Pago
  email           TEXT NOT NULL,
  novidades       INTEGER NOT NULL DEFAULT 0, -- 1 = aceitou receber novidades
  valor           REAL NOT NULL,
  metodo          TEXT,                       -- pix, master, visa, debvisa...
  tipo            TEXT,                       -- bank_transfer, credit_card, debit_card
  mp_pagamento_id TEXT UNIQUE,
  status          TEXT NOT NULL,              -- criado, pending, in_process, approved, rejected, cancelled, refunded, charged_back, erro
  status_detalhe  TEXT,
  codigo          TEXT,                       -- código de acesso gerado quando o pagamento é aprovado
  criado_em       TEXT NOT NULL,
  atualizado_em   TEXT NOT NULL,
  pago_em         TEXT,
  email_enviado_em TEXT
);
CREATE INDEX pedidos_status ON pedidos (status, criado_em);
CREATE INDEX pedidos_email ON pedidos (email);

-- Códigos de acesso (de compras ou gerados à mão para teste)
CREATE TABLE codigos (
  codigo           TEXT PRIMARY KEY,          -- formato XXXX-XXXX-XXXX-XXXX
  pedido_id        TEXT,
  email            TEXT,
  origem           TEXT NOT NULL,             -- compra, teste, manual
  limite_aparelhos INTEGER,                   -- vazio = usa LIMITE_APARELHOS
  ativo            INTEGER NOT NULL DEFAULT 1,
  criado_em        TEXT NOT NULL
);
CREATE INDEX codigos_pedido ON codigos (pedido_id);

-- Aparelhos/navegadores que já usaram cada código
CREATE TABLE aparelhos (
  codigo        TEXT NOT NULL,
  aparelho      TEXT NOT NULL,                -- identificador aleatório guardado no navegador
  descricao     TEXT,                         -- início do "user agent", para reconhecer o aparelho
  primeiro_uso  TEXT NOT NULL,
  ultimo_uso    TEXT NOT NULL,
  PRIMARY KEY (codigo, aparelho)
);
