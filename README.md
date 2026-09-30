# Site — Thales Carvalho & Thayson Azevedo

Site estático em HTML, CSS e JS puros, sem etapa de build.

```
index.html        página inicial (abertura, Correnteza, quem somos, trajetória, discografia, galeria, contato)
correnteza.html   página do álbum: faixas com player, encarte com letras e ficha técnica
css/estilo.css    estilos das duas páginas (a paleta fica nas variáveis de :root)
js/principal.js   parallax, capa de Correnteza, trajetória horizontal e galeria ampliada
js/album.js       player do álbum
img/              fotos em WebP, até 1600 px no lado maior, sem metadados/GPS
audio/            áudios do álbum (vazia por enquanto, veja abaixo)
backend/          venda do álbum: pagamentos, códigos de acesso e arquivos (veja backend/README.md)
```

## Player do álbum

Cada faixa em `correnteza.html` tem um `data-audio` com o arquivo esperado
(`audio/01-clareira.mp3` … `audio/08-correnteza.mp3`). O player verifica quais arquivos
existem: as faixas presentes ficam tocáveis e as demais aparecem como "em breve".
Com a pasta vazia, a página mostra só a lista e o encarte.
Atenção: tudo o que estiver em `audio/` fica público quando o site for publicado.

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
