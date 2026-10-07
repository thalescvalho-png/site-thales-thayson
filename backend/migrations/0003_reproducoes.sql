-- Quantas vezes cada faixa foi ouvida, por dia (o número "▶ 223" ao lado de cada faixa).
-- Como eventos_dia: só soma, nada identifica quem ouviu.
CREATE TABLE reproducoes_dia (
  dia    TEXT NOT NULL,                       -- AAAA-MM-DD (horário de Brasília)
  faixa  TEXT NOT NULL,                       -- id da faixa no encarte (01-clareira)
  tipo   TEXT NOT NULL,                       -- previa ou completa
  total  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, faixa, tipo)
);
