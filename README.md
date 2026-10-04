# Site — Thales Carvalho & Thayson Azevedo

Site estático em HTML, CSS e JS puros, sem etapa de build.

```
index.html          página inicial (abertura, Correnteza, quem somos, trajetória, discografia, galeria, contato)
correnteza.html     página do álbum: compra, faixas com player, encarte, ficha técnica e mural dos ouvintes
links/              página de links para a bio do Instagram
clareira/ … endless/  endereços curtos de cada faixa (cartão de link próprio + leva à página do álbum)
termos.html         Termos de Uso          privacidade.html   Política de Privacidade
descadastro.html    sair da lista de novidades (link no fim dos e-mails)
admin.html          só da dupla: moderar o mural e ver vendas e funil (senha)
css/estilo.css      estilos de todas as páginas (a paleta fica nas variáveis de :root)
js/principal.js     parallax, capa de Correnteza, trajetória horizontal e galeria ampliada
js/medicao.js       origem dos links marcados, Cloudflare Web Analytics e contagem do funil (sem cookies)
js/album.js         código de acesso, player, encarte e cartão do fim da prévia (tudo vem da API de venda)
js/compra.js        compra pelo Mercado Pago (Pix, crédito e débito) e tela de "obrigado"
js/aparelhos.js     "Meus aparelhos" e desconectar um aparelho antigo
js/compartilhar.js  cartões para os Stories (ouvindo, apoiei, verso)
js/transmitir.js    ouvir na TV: Chromecast, AirPlay, "Assistir na TV" e o painel de controle remoto no celular
js/tela-tv.js       a tela da TV (capa, letra sincronizada, barra do álbum), usada no Modo TV e no celular
js/bioluz.js        a barra bioluminescente (player, letra e TV)
js/tv.js            Modo TV: código, QR, conexão com a sala, áudio e teclas do controle da TV
tv/index.html       Modo TV: a página aberta no navegador da TV
css/tela-tv.css     visual da tela da TV (tamanhos, cores e velocidade da rolagem comentados)
css/transmitir.css  ícones de TV no player, janela "Assistir na TV" e painel "Na TV"
img/tv/             capa em JPG (Chromecast, tela de bloqueio) e a miniatura do fundo desfocado
js/mural.js         mural dos ouvintes          js/admin.js   página de administração
img/                fotos em WebP, até 1600 px no lado maior, sem metadados/GPS
img/og/             cartões de link 1200×630 (gerados por scripts/gerar-cartoes-de-link.sh)
audio/              masters guardados só neste computador (ignorados pelo Git, nunca vão para o site)
backend/            venda do álbum: pagamentos, códigos, aparelhos, lista, mural (veja backend/README.md)
```

## Compra e player do álbum

`correnteza.html` não guarda nenhum áudio nem letra: tudo vem da API de venda (`backend/`).

- **Sem código:** cada faixa toca uma prévia de 15 s, e o encarte mostra só os títulos.
- **Compra:** a pessoa informa o e-mail e paga pelo formulário do Mercado Pago (Pix, crédito ou débito).
  No Pix, a página mostra o QR code e o "copia e cola" e libera o álbum sozinha quando o pagamento cai,
  mesmo que a pessoa feche e volte depois.
- **Fim da prévia:** a primeira prévia ouvida até o fim abre um cartão com "Ouvir o álbum completo"
  (vai para a compra) e "Me avise das novidades" (só o e-mail, com a caixa de consentimento).
- **Com código** (pela compra, pelo link do e-mail ou digitado em "Já comprei"): faixas completas,
  letras no encarte da página e o encarte em PDF. **Só player:** as faixas não baixam
  (`DOWNLOAD_FAIXAS` no backend). No lugar do antigo "Baixe o álbum" fica "Baixe o encarte em PDF".
- **Aparelhos:** o código vale em até 3 aparelhos. Em "Meus aparelhos" o comprador vê quais são e
  desconecta um antigo (até 3 trocas por mês). No quarto aparelho, a página mostra a lista e oferece
  liberar uma vaga. Quem abre pelo navegador do Instagram vê um aviso para abrir no navegador do celular.
- **Uma reprodução por vez:** se outro aparelho com o mesmo código der play, este pausa com um aviso.
- **Links que expiram:** as faixas completas chegam por links assinados que valem 30 minutos.
  A página pede links novos sozinha e, se um vencer no meio da música, continua de onde parou.
- O código fica guardado no navegador. "Sair deste aparelho" o apaga e libera a vaga.

Duas configurações ficam no topo de `correnteza.html`:

```html
<meta name="correnteza-api" content="https://correnteza.correnteza-backend.workers.dev">
<meta name="mp-public-key" content="">
```

Cole em `mp-public-key` a **Public Key** do Mercado Pago (Credenciais → Public Key; ela **não** é segredo).
Enquanto ela estiver vazia, o formulário de pagamento não aparece ("abre em breve"), mas as prévias
e os códigos funcionam. Use primeiro a Public Key **de teste** junto com o Access Token de teste no backend.

A API só aceita chamadas do endereço do GitHub Pages (`SITE_ORIGENS` no backend). Por isso, abrindo o
arquivo direto do computador, as prévias e a compra não carregam. Isso é normal.

### Testar no computador

Com o site aberto em `http://localhost:8765` (por exemplo `python3 -m http.server 8765` nesta pasta),
as páginas usam sozinhas o backend local em `http://localhost:8787`. Para ligá-lo, na pasta `backend`:
crie um arquivo `.dev.vars` com `SITE_ORIGENS=http://localhost:8765` e `ADMIN_SENHA=` (uma senha
qualquer de teste) e rode `npm run dev`. Códigos de teste locais: `npm run codigo -- --local`.

## Divulgação: links marcados, cartões e Stories

Use sempre um link marcado, para o painel mostrar de onde vêm as prévias e as vendas. A origem fica
guardada no navegador por 30 dias, então vale mesmo se a pessoa comprar dias depois.

| Onde | Link |
|---|---|
| Bio do Instagram | `.../links/?utm_source=instagram&utm_medium=bio` |
| Stories (link no adesivo) | `.../lugubre/?utm_source=instagram&utm_medium=stories` (os cartões gerados no site já copiam assim) |
| Mensagem direta (DM) | `.../correnteza.html?utm_source=instagram&utm_medium=dm` |
| WhatsApp (status, grupos) | `.../correnteza.html?origem=whatsapp` |
| QR code nos shows e impressos | `.../links/?origem=qr-show` |

(`...` = `https://thalescvalho-png.github.io/site-thales-thayson`. Também vale `?origem=qualquer-nome`.)

- **Endereços curtos das faixas:** `/clareira/`, `/candeia/`, `/no-leito/`, `/meandros/`, `/a-danca-das-chamas/`,
  `/degredo/`, `/lugubre/`, `/correnteza/` (a faixa 8), `/endless/`. Cada um mostra o cartão da faixa no
  WhatsApp/Instagram e abre a página do álbum com a faixa escolhida.
- **Cartões de link** (`img/og/`): para refazer depois de mudar textos ou cores, edite
  `scripts/cartao-de-link.html` e rode `./scripts/gerar-cartoes-de-link.sh` (precisa do Chrome).
  O WhatsApp guarda o cartão antigo por um tempo; o Facebook atualiza em https://developers.facebook.com/tools/debug/.
- **Cartões para Stories:** o botão de compartilhar no player (e "Conte nos Stories que você apoiou", e
  "criar um cartão com um verso" na letra) monta a imagem 1080×1920 no próprio celular e abre o menu de
  compartilhar, com o link já copiado para colar no adesivo de link.
- **Domínio próprio:** os cartões precisam de endereço completo. Quando o domínio chegar, troque
  `https://thalescvalho-png.github.io/site-thales-thayson/` em todos os `.html` (busque por `og:`).

## Medição sem cookies

- **Cloudflare Web Analytics** (visitas, páginas, países, de onde vieram): no painel da Cloudflare, abra
  **Analytics & Logs → Web Analytics → Add a site**, informe o endereço do site e copie o `token` do
  código que aparece. Cole em `TOKEN_WEB_ANALYTICS`, no topo de `js/medicao.js`. Vazio = desligado.
- **Funil** (visita → prévia → abriu a compra → pagamento → compra, e também novidades, Stories, mural):
  contagens por dia e por origem, sem nada que identifique a pessoa. Veja em `admin.html` ou com
  `npm run funil` na pasta `backend`. As vendas por origem saem dos pedidos aprovados.

## Mural, lista de e-mails e administração

- **Mural** (`#mural` na página do álbum): comentários sobre o álbum ou sobre uma faixa. Quem comprou
  comenta direto e ganha o selo de apoiador; quem não comprou informa o e-mail, que nunca aparece.
  No começo tudo passa por aprovação (`MURAL_MODERACAO = "antes"` no backend).
- **Lista de e-mails:** compra (caixa de novidades), "me avise" do fim da prévia e mural. Só recebe
  novidades quem marcou a caixa. Exporte com `npm run exportar-emails` (cada linha leva o
  `link_descadastro`, que deve ir no rodapé de todo envio de novidades).
- **admin.html:** moderar o mural e ver vendas, funil e lista. A senha é a `ADMIN_SENHA` do backend.

## Termos e Privacidade

`privacidade.html` é um quadro curto dizendo que o site respeita a LGPD, apontando para os contatos do site.
`termos.html` traz as regras de compra e do mural (Código de Defesa do Consumidor) e **não substitui uma
revisão jurídica** antes de abrir as vendas. Falta o e-mail de contato (`[e-mail de contato]` nos Termos). Se mudar o limite de aparelhos ou de trocas no backend,
atualize os números nos Termos.

## Encarte

As oito letras foram enviadas pela dupla (set/2026). Os créditos de No Leito, Meandros e Lúgubre
vêm dos documentos do Google Drive; as demais faixas estão com `[créditos de letra e composição]`.
A ordem das faixas segue a numeração dos masters (01 a 08); Lúgubre ficou como 07.

## Capa

`CAPA - Album (sem marca).png`, na pasta de fotos, é a capa com a marca ✦ do Gemini removida
(o original continua intacto). É dela que sai `img/sem-ano_capa-album_correnteza.webp`.

## Padrão dos nomes das fotos

`ano_evento_musica.webp`, em minúsculas, sem acento e com hífens.
Quando o dado não aparece na legenda nem na foto, o nome usa `sem-ano`, `sem-evento` ou `sem-musica`.
Quando há mais de uma foto com o mesmo nome, entra um sufixo `-1`, `-2`, `-3`.
No site, os dados que ainda faltam aparecem entre colchetes (`[ano]`, `[evento]`).

## Onde cada foto entrou

| Foto | Original | Seção |
|---|---|---|
| sem-ano_capa-album_correnteza | CAPA - Album.png (versão sem marca) | Correnteza (capa) + Discografia + página do álbum |
| sem-ano_sem-evento_sem-musica-3 | Thales Thayson.jpg | Quem somos (retrato) |
| 2009_festival-alvinopolis_meu-triunfo-e-o-rock-n-roll | 2009.jpg | Trajetória 2009 |
| 2012_festival-alvinopolis_monotonia | Festival 2012 -monotonia.jpg | Trajetória 2012 |
| 2014_festival-alvinopolis-premiacao_o-espelho-do-outro-lado | trofeu_2014.jpg (= Premiação quarto lugar… 2014.jpg) | Trajetória 2014 |
| 2016_festival-alvinopolis-fase-local_encruzilhada | encruzilhada_premio.jpeg | Trajetória 2016 |
| 2019_festival-alvinopolis-premiacao_no-leito | Primeiro lugar geral… 2019.jpg | Trajetória 2019 |
| 2023_festival-alvinopolis-premiacao_lugubre | Festival 2023 - Lugubre.jpg | Trajetória 2023 |
| 2025_festival-alvinopolis-premiacao_meandros | Meandros -.jpeg | Trajetória 2025 (Melhor Música de Alvinópolis) |
| 2026_festival-alvinopolis-premiacao_do-avesso | Premiacao Do avesso Festival 2026 - Alvinopolis.jpg | Trajetória 2026 (Melhor Música de Alvinópolis) |
| 2025_show-acustico-correnteza_sem-musica-3 | Apresentacao - acustico Correnteza.jpg | Trajetória “Hoje” |
| sem-ano_capa-single_pacifico-homem | PACIFICO HOMEM.png | Discografia + barra do celular |
| sem-ano_clipe_danca-das-chamas | Clipe.png | Discografia (A Dança das Chamas, videoclipe) |
| 2014_festival-alvinopolis_o-espelho-do-outro-lado | Festival 2014 O espelho do outro lado- 2014.jpeg | Galeria |
| 2019_rock-in-rua_sem-musica | Rock in Rua 2019.jpg | Galeria |
| 2023_festival-alvinopolis_lugubre | Lugubre_festival.jpeg | Galeria |
| 2024_gravacao-leve-music_sem-musica | Colagens1.png | Galeria |
| 2025_show-acustico-correnteza_sem-musica-1 | 20250903_195124(1).jpg | Galeria |
| 2025_show-acustico-correnteza_sem-musica-2 | 20250903_195512.jpg | Galeria |
| 2025_apresentacao_sem-musica-1 | Apresentacao aleatoria.jpg | Galeria |
| 2025_apresentacao_sem-musica-2 | IMG-20260129-WA0055.jpg | Galeria |
| 2026_sem-evento_sem-musica | 20260815_150745.jpg | Galeria |
| 2026_festival-alvinopolis_do-avesso-1 | Do Avesso - Festival.jpg | Galeria |
| 2026_festival-alvinopolis_do-avesso-2 | Foto Thales e Thay.jpg | Galeria |
| 2026_festival-alvinopolis_do-avesso-3 | IMG-20260824-WA0114.jpg | Galeria |
| sem-ano_festival-bela-vista_lugubre | lugubre_belavista.jpeg | Galeria |
| sem-ano_festival-bela-vista_sem-musica | Festival_belavista.jpeg | Galeria |
| sem-ano_mostra-cultural-lei-paulo-gustavo_danca-das-chamas-e-lugubre | paulogustav.jpeg | Galeria |
| sem-ano_gravacao-home-studio_pacifico-homem | Gravacao Pacifico homem.png | Galeria |
| sem-ano_equipe_sem-musica | equipe.jpeg | Galeria |
| sem-ano_sem-evento_sem-musica-1 | Fotos Thales e Thays.jpg | Galeria |
| sem-ano_sem-evento_sem-musica-2 | Fotos Thales e Thayson.jpg | Galeria |
| sem-ano_bolsa-amarela_sem-musica | bolsaamarela.jpeg | Galeria |

## Ouvir na TV

Só para quem tem o código de acesso. Três caminhos, todos na página do álbum:

| Aparelho | Como | O que a TV mostra | A letra sincronizada |
|---|---|---|---|
| Android e computador (Chrome) | ícone do Google Cast no player (só aparece se houver um Chromecast/Google TV na rede) | capa e título (tela padrão do Google) | no celular |
| iPhone (Safari) | ícone da AirPlay no player (no lugar do Cast) | capa e título | no celular |
| Qualquer TV com navegador (Samsung, LG...) | **Assistir na TV**: a TV abre `/tv` e mostra um código | capa de fundo, letra sincronizada e a barra do álbum | na TV e no celular |

- No celular abre o painel **Na TV**: a mesma tela da TV em versão compacta, com a barra do álbum inteiro
  em trechos (tocar num trecho pula para a faixa; arrastar adianta ou volta), tocar/pausar, anterior e próxima.
- **Segurança:** a TV e o Chromecast recebem só links assinados que vencem: 15 minutos no Modo TV (renovados
  pela sala enquanto a TV estiver conectada) e, no Chromecast, cada faixa vence 20 minutos depois do fim
  previsto dela. A TV nunca recebe o código de acesso e não ocupa uma das 3 vagas de aparelho.
- **Uma reprodução por vez:** a TV do Modo TV conta como a reprodução ativa da conta; se outro aparelho der
  play, ela pausa com um aviso (e vice-versa). No Chromecast, quem vigia é o celular enquanto a página está aberta.
- **Endereço da TV:** fica na meta `tv-endereco`, no topo de `correnteza.html`. Ao criar um atalho curto
  (ex.: is.gd) ou quando chegar o domínio próprio, troque ali.
- **Letra:** vem dos `.lrc` (pasta `lyrics/` do R2). Faixa sem `.lrc` mostra só a capa e o título.
- **Ajustes visuais:** tamanhos, cores e velocidade da rolagem estão comentados em `css/tela-tv.css`
  (procure "AJUSTE"); tempos do controle remoto no topo de `js/tv.js`.

### Como testar

**Android (Chrome) + Chromecast ou Google TV**
1. Celular e Chromecast na mesma rede Wi-Fi. Abra a página do álbum no Chrome, com o código de acesso.
2. O ícone de transmitir aparece no player (se não aparecer: o Chromecast está em outra rede, ou o navegador não é o Chrome).
3. Toque nele e escolha a TV. A TV começa na faixa e no ponto em que o celular estava, e o celular abre o painel com a letra.
4. Teste: pausar, próxima, tocar no trecho 05 da barra, arrastar a barra, bloquear o celular (o álbum segue até o fim).
5. Em outro aparelho com o mesmo código, dê play: em até 20 s a TV pausa (com a página do álbum aberta no celular).

**iPhone (Safari) + Apple TV ou TV com AirPlay 2**
1. Mesma rede Wi-Fi. Abra a página do álbum no Safari e dê play numa faixa.
2. Toque no ícone da AirPlay no player e escolha a TV. O painel "Na TV" abre com a letra.
3. Confira a capa e o título na TV e na tela de bloqueio; troque de faixa pela tela de bloqueio.

**Modo TV (Samsung, LG, qualquer TV com navegador)**
1. Na TV, abra o navegador e digite o endereço de `tv-endereco` (ex.: `thalescvalho-png.github.io/site-thales-thayson/tv`).
2. Aparecem um código de 6 letras/números e um QR. No celular: aponte a câmera para o QR, ou abra o álbum e toque em **Assistir na TV**, digite o código e toque em **Conectar**.
3. Na TV, aperte **OK** no controle (os navegadores só liberam o som depois de um toque na própria TV).
4. Controle da TV: OK = tocar/pausar; ← → = faixa anterior/próxima (segurando: volta/adianta 10 s); ↑ ↓ = mostra/esconde a barra.
5. Teste também: desligar o Wi-Fi da TV por alguns segundos (ela reconecta sozinha); **Desconectar** no celular (a TV volta a mostrar um código novo).
6. Google TV não tem navegador de fábrica: nela, use o Cast (ela tem Chromecast embutido).

### Fase 2: receptor próprio do Google Cast (pago, US$ 5 uma vez)

Com ele, a TV mostra a mesma tela do Modo TV também pelo Chromecast. O código já está pronto para isso:
1. Criar `tv/receiver.html` com o CAF Receiver SDK (`//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js`),
   `css/tela-tv.css`, `js/bioluz.js`, `js/letra-lrc.js` e `js/tela-tv.js`; criar a tela com `TelaTV.criar(...)` e
   ligar os eventos do `PlayerManager` (faixa atual, tempo, tocando) a `tela.posicao(...)`. As letras podem ir
   no `customData` de cada item da fila, montada em `js/transmitir.js`.
2. No console do Google Cast, cadastrar o receptor com o endereço `.../tv/receiver.html` e publicar.
3. Em `js/transmitir.js`, trocar `CAST_APP_ID = 'CC1AD845'` pelo ID do receptor. O botão continua o mesmo.
