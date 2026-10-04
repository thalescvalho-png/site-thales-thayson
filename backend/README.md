# Venda do álbum Correnteza: backend

Este é o "balcão" da venda. Ele recebe o pagamento pelo Mercado Pago, gera o código de acesso,
envia o e-mail de agradecimento e entrega as músicas (só no player) e o encarte só para quem comprou.
Também guarda os aparelhos de cada código, a lista de e-mails, o mural dos ouvintes e a contagem do funil.
Ele roda na Cloudflare, e o site continua estático no GitHub Pages.

- **Endereço da API:** https://correnteza.correnteza-backend.workers.dev
- **Página do álbum** (para onde o link do e-mail leva): https://thalescvalho-png.github.io/site-thales-thayson/correnteza.html

Todos os comandos abaixo são digitados no **Terminal**, dentro da pasta `backend`:

```bash
cd ~/Desktop/"Arquivos Site"/site-thales-thayson/backend
```

---

## Onde fica cada coisa

| O quê | Onde | Público? |
|---|---|---|
| Site (páginas, fotos, CSS) | `site-thales-thayson/` → GitHub Pages | sim |
| Código deste backend | `site-thales-thayson/backend/` → GitHub | sim (não há segredos nele) |
| Letras, PDF, faixas completas, prévias | `Arquivos Site/correnteza-privado/` (**fora** do site) | não |
| Arquivos que os compradores baixam | R2 `correnteza` → pastas `previews/` e `full/` | só `previews/` |
| Pedidos, códigos, aparelhos, lista de e-mails, mural, funil | banco D1 `correnteza` | não |
| Senhas e chaves | segredos do Worker (`wrangler secret put`) | não |

Dentro de `correnteza-privado/`:

```
encarte/encarte.json            letras e créditos (a fonte de tudo)
encarte/Correnteza-Encarte.pdf  gerado a partir do JSON
encarte/linha-correnteza.svg    o rio e as montanhas do PDF (editável)
encarte/capa.jpg                capa usada no PDF e nos MP3
faixas/01-clareira.mp3 ...      faixas completas (cópias com as tags corrigidas)
previews/01-clareira.mp3 ...    prévias de 15 s
exportacoes/                    e-mails exportados
```

> **Nunca** coloque letras, faixas completas ou chaves dentro da pasta do site. O repositório é público.

---

## Onde colar as credenciais

As chaves **nunca** vão para arquivos nem para o Git. Você cadastra cada uma com o comando abaixo.
Ele pede o valor: cole e aperte Enter (o texto não aparece, é normal).

```bash
npx wrangler secret put MP_ACCESS_TOKEN
```

Elas passam a valer na hora, sem precisar publicar de novo. Para ver quais já estão cadastradas
(só os nomes, nunca os valores): `npx wrangler secret list`.

### 1. Mercado Pago: `MP_ACCESS_TOKEN`
1. Entre em https://www.mercadopago.com.br/developers → **Suas integrações** → **Criar aplicação**
   (nome "Correnteza"; tipo de pagamento: pagamentos on-line / Checkout Transparente / Bricks).
2. Na aplicação, abra **Credenciais de produção** e copie o **Access Token** (começa com `APP_USR-`).
3. `npx wrangler secret put MP_ACCESS_TOKEN` e cole.

A **Public Key** (também em Credenciais) **não** é segredo: ela vai na página do álbum,
na linha `<meta name="mp-public-key" content="">` do topo de `correnteza.html`.
Use a Public Key do mesmo tipo do Access Token (as duas de teste, ou as duas de produção).

> Para testar sem cobrar de verdade, use primeiro as **Credenciais de teste** e os cartões de teste
> do Mercado Pago. Depois troque pelo Access Token de produção com o mesmo comando.

### Parcelamento em até 3x sem juros
A página e o backend aceitam no máximo 3 parcelas no crédito. Quem decide se as parcelas têm juros
é a **sua conta** do Mercado Pago: nas configurações de custos/parcelamento da conta, ative a opção de
oferecer parcelamento **sem juros** (sem acréscimo para o comprador) até 3x. A taxa dessas parcelas
passa a ser descontada de você. Sem essa opção, o comprador vê as parcelas com juros.

### 2. Mercado Pago: aviso de pagamento (`MP_WEBHOOK_SECRET`)
1. Na mesma aplicação: **Webhooks** → **Configurar notificações**.
2. URL (modo produção): `https://correnteza.correnteza-backend.workers.dev/api/webhook/mercadopago`
3. Evento: marque **Pagamentos** e salve.
4. Clique para revelar a **assinatura secreta**, copie e rode `npx wrangler secret put MP_WEBHOOK_SECRET`.
5. Opcional: o botão **Simular notificação** do painel deve responder 200 (um id fictício é ignorado).

Se um aviso se perder, nada se perde: a página consulta o pedido e, a cada 10 minutos,
o backend confere sozinho os pagamentos pendentes.

### 3. E-mail: `RESEND_API_KEY`
1. Crie uma conta em https://resend.com → **API Keys** → **Create API Key** (permissão "Sending access").
2. Copie a chave (começa com `re_`) e rode `npx wrangler secret put RESEND_API_KEY`.

**Enquanto a chave não existir,** nenhum e-mail sai: o log só anota o número do pedido (nunca o e-mail).
O código de cada compra aparece em `npm run pedidos`. Quando você cadastrar a chave, os pedidos pagos
nos 3 dias anteriores que ficaram sem e-mail recebem o e-mail automaticamente em até 10 minutos.
Sem envio de e-mails, os comentários do mural de quem não comprou vão direto para a moderação;
com ele, a pessoa primeiro confirma o e-mail por um link.

⚠️ **Sem domínio próprio**, o Resend só entrega e-mails para o **seu próprio endereço** (o da conta Resend).
Antes de abrir a venda, verifique um domínio no Resend (**Domains → Add Domain**) e troque o
`EMAIL_REMETENTE` (veja "Configurações"), por exemplo para `Thales & Thayson <album@seudominio.com.br>`.
Mesmo sem e-mail, o comprador tem acesso na hora: a página recebe o código assim que o pagamento é aprovado.

### 4. Administração: `ADMIN_SENHA`
Senha da página `admin.html` (moderar o mural, ver vendas e funil). Escolha uma senha longa:

```bash
npx wrangler secret put ADMIN_SENHA
```

Sem ela, a página de administração não abre. A moderação também funciona pelo Terminal (veja abaixo).

---

## Testar sem o Mercado Pago (modo de teste)

```bash
npm run codigo                                   # cria um código de teste (vale em 3 aparelhos)
npm run codigo -- --aparelhos 2                  # com outro limite de aparelhos
npm run codigo -- --email voce@exemplo.com       # anotando para quem é
```

O comando mostra o código e o link da página: abra o link para ver o álbum liberado.
Também dá para conferir direto no navegador:

```
https://correnteza.correnteza-backend.workers.dev/api/album?token=SEU-CODIGO&aparelho=meu-teste-1
```

Cada valor diferente em `aparelho=` conta como um aparelho. Para liberar as vagas depois:
`npm run liberar-aparelhos -- SEU-CODIGO`. Para desligar um código: `npm run desativar-codigo -- SEU-CODIGO`.

> Nunca escreva um código válido em arquivos do site ou deste backend: o repositório é público.

---

## Ouvir na TV (Modo TV e Chromecast)

- `POST /api/tv/sessao`, `POST /api/tv/parear`, `GET /api/tv/ws`: Modo TV. Cada TV ganha uma "sala"
  (Durable Object `SalaTV`, em `src/sala-tv.ts`) com o nome do código que aparece na tela. A sala liga a TV
  ao celular por WebSocket, assina os links das faixas (15 min) e vigia a regra de uma reprodução por vez.
  Parada, ela hiberna e não gasta nada; tudo cabe no plano gratuito da Cloudflare.
- `GET /api/cast/fila`: a fila do Chromecast, com links que vencem 20 min depois do fim previsto de cada faixa.
- **Duração das faixas:** depois de trocar alguma faixa, rode `./scripts/duracoes.sh` e `./scripts/enviar-r2.sh full`.
  Ela grava a `duracao` de cada faixa no `encarte.json` (para a barra do álbum e para a validade dos links).
- A primeira publicação depois desta mudança (`npm run publicar`) cria o Durable Object sozinha.

## Atualizar as músicas

1. Coloque as faixas novas em `correnteza-privado/faixas/` com os mesmos nomes
   (`01-clareira.mp3`, `02-candeia.mp3`, … `09-endless.mp3`), em MP3.
2. Corrija as informações internas (título, artista, álbum, número, ano e capa):
   ```bash
   ./scripts/preparar-faixas.sh
   ```
   O ano fica no começo do script (`ANO="2026"`).
3. Refaça as prévias e envie tudo:
   ```bash
   ./scripts/gerar-previas.sh
   ./scripts/enviar-r2.sh tudo
   ```
   O `.zip` do álbum é montado de novo automaticamente.

## Atualizar o encarte (letras e créditos)

1. Edite `correnteza-privado/encarte/encarte.json`. Cada letra é uma lista de estrofes,
   e cada estrofe é uma lista de versos entre aspas retas `"`.
   Se usar o **TextEdit**, antes desligue **Editar → Substituições → Aspas Inteligentes**. Senão, ele troca
   `"` por `“ ”` e o arquivo quebra. (Se algo quebrar, os scripts avisam a linha do erro e não enviam nada.)
2. Gere o PDF de novo e envie:
   ```bash
   python3 scripts/gerar-encarte-pdf.py
   ./scripts/enviar-r2.sh full
   ```
   O player e os compradores veem a mudança em até 5 minutos.

**O rio e as montanhas do PDF** ficam em `encarte/linha-correnteza.svg`: uma tira comprida com as 12 páginas
empilhadas. Você pode abrir o arquivo no **Inkscape** (gratuito), no **Figma** ou no **Illustrator** e
redesenhar o rio. A camada **"guias"** (rosa) mostra as bordas das páginas e onde está cada texto, e não entra no PDF.
Cores e espessuras ficam no começo do arquivo (`#C68B3E` é o âmbar do rio).
Depois de salvar, rode `python3 scripts/gerar-encarte-pdf.py`.

- Mudou o tamanho das letras e o rio passou a encostar no texto? Rode
  `python3 scripts/gerar-encarte-pdf.py --nova-linha` para ele desenhar tudo de novo desviando das letras.
  O desenho anterior fica guardado como `linha-correnteza.anterior.svg`.

## Ajustar as prévias

Abra `backend/previas.txt` e troque o início de cada faixa (minutos:segundos). Nele também ficam
a duração (15 s) e o fade (1,5 s). Depois:

```bash
./scripts/gerar-previas.sh
./scripts/enviar-r2.sh previews
```

---

## Comandos do dia a dia

| Comando | Para quê |
|---|---|
| `npm run pedidos` | últimos 20 pedidos (`-- --quantos 50` para mais) |
| `npm run exportar-emails` | lista de novidades (só quem marcou a caixa e não saiu) → `correnteza-privado/exportacoes/`, com o `link_descadastro` de cada pessoa (`-- --compradores` ou `-- --previa` para separar) |
| `npm run funil` | etapas do funil e vendas por origem (`-- --dias 7`) |
| `npm run comentarios` | comentários esperando aprovação (`-- --status publicado` para os publicados) |
| `npm run publicar-comentario -- ID` | publica um comentário do mural |
| `npm run apagar-comentario -- ID` | apaga um comentário |
| `npm run aparelhos -- CODIGO` | quais aparelhos já usaram um código |
| `npm run liberar-aparelhos -- CODIGO` | zera os aparelhos (ex.: comprador trocou de celular) |
| `npm run desativar-codigo -- CODIGO` | o código deixa de funcionar |
| `npm run codigo` | cria um código de teste |
| `npm run logs` | mostra ao vivo o que o backend está fazendo (Ctrl+C para sair) |
| `npm run banco:atualizar` | aplica as mudanças do banco (pasta `migrations/`) **antes** do `npm run publicar` |
| `npm run publicar` | publica mudanças no código ou nas configurações |

Um pedido estornado ou contestado desativa o código sozinho.

## Configurações (`wrangler.jsonc`)

Depois de mudar qualquer uma, rode `npm run publicar`.

| Nome | Para quê | Hoje |
|---|---|---|
| `SITE_ORIGENS` | sites que podem chamar a API (CORS), separados por vírgula | GitHub Pages |
| `PAGINA_ALBUM` | página que o link do e-mail abre (`?codigo=` é acrescentado) | `.../correnteza.html` |
| `PRECO` | preço cobrado (o navegador não consegue alterar) | `22.90` |
| `LIMITE_APARELHOS` | aparelhos/navegadores por código | `3` |
| `TROCAS_APARELHO_MES` | quantos aparelhos o comprador pode desconectar sozinho a cada 30 dias | `3` |
| `DOWNLOAD_FAIXAS` | `sim` libera o download das faixas em MP3 e do .zip; `nao` = só player (o PDF do encarte baixa sempre) | `nao` |
| `MURAL_MODERACAO` | `antes`: todo comentário espera aprovação; `depois`: o de quem comprou (ou confirmou o e-mail) publica direto | `antes` |
| `EMAIL_REMETENTE` | remetente do e-mail | `onboarding@resend.dev` |
| `EMAIL_RESPONDER_PARA` | para onde vão as respostas dos compradores (opcional) | vazio |
| `PIX_VALIDADE_MINUTOS` | tempo para pagar o Pix | `30` |

Quando o site ganhar um domínio próprio, acrescente-o em `SITE_ORIGENS` e troque `PAGINA_ALBUM`.
O texto do e-mail fica em `src/email.ts`.

Para trocar o nome `correnteza-backend` do endereço `workers.dev`, use
https://dash.cloudflare.com/aeca0bb37e3c7e60c4af6ee645a2b32e/workers/subdomain. Depois atualize a URL do
webhook no Mercado Pago e o endereço da API na página do álbum.

---

## Como a página conversa com a API

| Pedido | O que devolve |
|---|---|
| `GET /api/album` | álbum, preço e faixas com `previa` (URL da prévia) |
| `GET /api/album?token=CODIGO&aparelho=ID` | `acesso: true`, e cada faixa ganha `audio` (link assinado, vale 30 min), `letra` (estrofes) e `creditos`; `download` só com `DOWNLOAD_FAIXAS = "sim"`. Também vem `encarte.pdf`, `encarte.json`, `encarte.creditosGerais`, `linksExpiram` e `agora` (e `zip`, se o download estiver liberado). Se o código não servir: `acesso: false` e `motivo` (`codigo_invalido`, `limite_aparelhos`, `sem_aparelho`, `muitas_tentativas`) |
| `GET /api/links?token=&aparelho=` | links novos das faixas e do encarte, com nova validade |
| `GET /api/aparelhos?token=&aparelho=` | aparelhos do código (`nome`, datas, `este`, `ref`), `limite` e `trocasRestantes`. Funciona também no aparelho que ficou de fora do limite |
| `POST /api/aparelhos/liberar` | `{ token, aparelho, ref }` desconecta um aparelho (sair do próprio não conta como troca) |
| `POST /api/tocando` · `GET /api/tocando?token=&aparelho=` | este aparelho deu play e pega a vez · ainda é a vez dele? (`meu`, `outro`) |
| `POST /api/novidades` | `{ email, nome?, aceite: true, origem }` entra na lista de novidades |
| `POST /api/descadastrar` | `{ email, chave }` sai da lista (a chave vem do link do e-mail) |
| `GET /api/comentarios` · `POST /api/comentarios` | mural publicado · novo comentário `{ nome, cidade?, texto, faixa?, email? ou token+aparelho, novidades? }` |
| `POST /api/comentarios/confirmar` | `{ id, segredo }` link de confirmação do e-mail do mural |
| `POST /api/evento` | `{ evento, origem }` soma +1 no funil do dia (sem dado pessoal) |
| `/api/admin/comentarios`, `/api/admin/resumo` | moderação e resumo, com `Authorization: Bearer ADMIN_SENHA` |
| `POST /api/checkout` | corpo: `{ selectedPaymentMethod, formData }` (o que o Payment Brick entrega) + `email` + `novidades` (true/false). Resposta: `pedido`, `status`; no Pix, `pix.copia_e_cola`, `pix.qr_code_base64` e `pix.expira_em`; se aprovado na hora, `codigo` |
| `GET /api/order/:pedido` | `status`, `pago` e, quando aprovado, `codigo` (a página consulta a cada poucos segundos até o Pix ser pago) |
| `GET /api/preview/:arquivo` | prévia (pública) |
| `GET /api/stream/:arquivo?k=&e=&s=` | faixa completa ou `encarte.json` por link assinado (ou, como antes, `?token=&aparelho=`), com suporte a Range |
| `GET /api/download/:arquivo?k=&e=&s=` | download com nome amigável: `encarte.pdf`; faixas e `album.zip` só com `DOWNLOAD_FAIXAS = "sim"` |

- `aparelho` é um identificador aleatório que a página cria uma vez e guarda no navegador
  (`crypto.randomUUID()`), junto com o código.
- O link do e-mail chega como `correnteza.html?codigo=XXXX-XXXX-XXXX-XXXX`. A página guarda o código e o tira do endereço.

## Segurança e limites

- O preço é sempre o do servidor. O pagamento só libera o código se o Mercado Pago confirmar o valor em reais.
- Os avisos do Mercado Pago só são aceitos com a assinatura correta. Mesmo assim, o backend confere o pagamento
  direto na API antes de liberar.
- Há limites de tentativas por IP (checkout, códigos errados, consultas) e por código (arquivos).
  Códigos têm 16 caracteres aleatórios, impossíveis de adivinhar.
- O limite de aparelhos e a reprodução em um aparelho por vez são proteções **básicas**: dificultam
  espalhar o código, mas ninguém impede que alguém grave o som enquanto toca. Os links das faixas expiram
  em 30 minutos e não mostram o código. A chave que assina os links é criada sozinha na tabela `config`
  do D1 (apagar essa linha invalida todos os links já entregues; a página pede novos sozinha).
- A lista de aparelhos não mostra o identificador verdadeiro de cada um (só um apelido), para que quem
  tem o código não consiga se passar por outro aparelho.
- As letras antigas ainda podem ser lidas no histórico público do GitHub (commits de 29/09/2026).
  Essa foi uma decisão consciente de não reescrever o histórico.

## Custos (planos gratuitos da Cloudflare)

- Workers: 100 mil pedidos por dia.
- D1: 5 GB.
- R2: 10 GB guardados, e a Cloudflare **não cobra pela transferência** dos arquivos. Hoje o álbum ocupa uns 160 MB.

Isso sobra para a venda de um álbum independente. O Mercado Pago cobra a tarifa dele por venda.
