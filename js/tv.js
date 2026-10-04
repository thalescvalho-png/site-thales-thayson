// Modo TV (tv/index.html): a página aberta no navegador da TV.
//
// 1. Pede um código curto à API e o mostra, com um QR code que abre o álbum no celular.
// 2. Conecta-se à sala da TV (WebSocket). Quando o celular confirma o código, chegam os títulos,
//    as letras sincronizadas e, a cada faixa, links que vencem em 15 minutos (nunca o código de acesso).
// 3. Toca o áudio aqui mesmo, mostra a tela da letra (js/tela-tv.js) e obedece ao celular
//    e ao controle remoto da TV.
// JavaScript antigo (ES5, sem fetch) de propósito: os navegadores de TV ficam anos sem atualizar.
(function(){
  // ===== AJUSTES =====
  var PULO_SEGUNDOS = 10;        // setas ← → seguradas: quanto volta ou adianta a cada passo
  var SEGURAR_MS = 450;          // quanto tempo segurar a seta para virar "adiantar" em vez de "próxima faixa"
  var ESTADO_A_CADA_MS = 5000;   // enquanto toca, a TV conta ao celular onde está (ele interpola entre um e outro)
  var AVISO_MS = 9000;           // quanto tempo um aviso fica na tela

  var API = (document.querySelector('meta[name="correnteza-api"]') || {}).content || '';
  API = API.replace(/\/$/, '');
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = 'http://localhost:8787';
  var WS = API.replace(/^http/, 'ws') + '/api/tv/ws';
  // a página do álbum, ao lado desta (o QR code leva o código junto)
  var PAGINA_ALBUM = location.href.replace(/[?#].*$/, '').replace(/tv\/(index\.html)?$/, '') + 'correnteza.html';

  function $(id){ return document.getElementById(id); }
  var audio = new Audio();
  audio.preload = 'auto';
  var tela = TelaTV.criar($('tela'), { leve: true, capa: '../img/tv/capa-1024.jpg', fundo: '../img/tv/capa-fundo.jpg' });

  // ----- Guardar a sessão (para voltar sozinha se a página recarregar) -----
  function ler(){ try { return JSON.parse(localStorage.getItem('correnteza.tv') || 'null'); } catch (e) { return null; } }
  function gravar(s){ try { if (s) localStorage.setItem('correnteza.tv', JSON.stringify(s)); else localStorage.removeItem('correnteza.tv'); } catch (e) {} }

  function pedir(metodo, caminho, corpo, pronto){
    var x = new XMLHttpRequest();
    x.open(metodo, API + caminho, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function(){ var d = {}; try { d = JSON.parse(x.responseText); } catch (e) {} pronto(x.status, d); };
    x.onerror = function(){ pronto(0, {}); };
    x.send(corpo ? JSON.stringify(corpo) : null);
  }

  // ----- Telas -----
  function camada(id, visivel){ $(id).className = 'camada' + (visivel ? ' visivel' : ''); }
  function situacao(t){ $('situacao').textContent = t; }

  function mostrarCodigo(sala){
    $('codigo').textContent = sala.slice(0, 3) + ' ' + sala.slice(3);
    situacao('O código vale 10 minutos. Depois disso, aparece um novo.');
    try {
      var qr = qrcode(0, 'M');
      qr.addData(PAGINA_ALBUM + '?tv=' + sala);
      qr.make();
      // módulos na cor "noite" sobre o fundo creme da caixa
      $('qrCaixa').innerHTML = qr.createSvgTag(4, 0).replace(/fill="white"/g, 'fill="#F4EDDC"').replace(/fill="black"/g, 'fill="#0E1826"');
      $('qr').hidden = false;
    } catch (e) { $('qr').hidden = true; }
    camada('parear', true);
  }

  // ----- Sessão e conexão -----
  var sessao = ler(), ws = null, ping = 0, falhas = 0, espera = 0, abriu = false;

  function novaSessao(){
    sessao = null; gravar(null);
    $('codigo').textContent = '· · · · · ·';
    situacao('Gerando o código…');
    camada('parear', true);
    pedir('POST', '/api/tv/sessao', null, function(status, d){
      if (status !== 200 || !d.sala){
        situacao(status === 429 ? 'Muitas tentativas. Um novo código aparece em instantes.' : 'Sem conexão com o site. Tentando de novo…');
        setTimeout(novaSessao, status === 429 ? 30000 : 8000);
        return;
      }
      sessao = { sala: d.sala, segredo: d.segredo };
      gravar(sessao);
      mostrarCodigo(d.sala);
      conectar();
    });
  }

  function conectar(){
    clearTimeout(espera);
    if (!sessao) return;
    abriu = false;
    try { ws = new WebSocket(WS + '?sala=' + encodeURIComponent(sessao.sala) + '&segredo=' + encodeURIComponent(sessao.segredo)); }
    catch (e) { tentarDeNovo(); return; }
    ws.onopen = function(){
      abriu = true; falhas = 0;
      clearInterval(ping);
      ping = setInterval(function(){ enviar({ tipo: 'ping' }); }, 25000);
      if (album) contarEstado();
    };
    ws.onmessage = function(e){ var m; try { m = JSON.parse(e.data); } catch (x) { return; } tratar(m); };
    ws.onclose = function(){
      clearInterval(ping);
      if (!sessao) return; // sessão encerrada de propósito
      if (!abriu) falhas++;
      // três tentativas sem conseguir abrir: a sala venceu (ex.: a TV ficou desligada). Pede um código novo.
      if (falhas >= 3){ falhas = 0; fim(); return; }
      tentarDeNovo();
    };
  }
  function tentarDeNovo(){ clearTimeout(espera); espera = setTimeout(conectar, Math.min(30000, 2000 * Math.pow(2, falhas))); }
  function enviar(m){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  // ----- Mensagens da sala -----
  var album = null, links = {}, linksExpiram = 0, esperandoLinks = [], avisoTempo = 0;

  function tratar(m){
    if (m.tipo === 'album') receberAlbum(m.album);
    else if (m.tipo === 'links'){
      for (var id in m.links) if (m.links.hasOwnProperty(id)) links[id] = m.links[id];
      linksExpiram = m.expira;
      var fila = esperandoLinks; esperandoLinks = [];
      fila.forEach(function(f){ f(); });
    }
    else if (m.tipo === 'comando') executar(m);
    else if (m.tipo === 'aviso') avisar(m.texto);
    else if (m.tipo === 'fim') fim();
  }

  function receberAlbum(a){
    var primeiro = !album;
    album = a;
    tela.album({
      titulo: a.titulo, artistas: a.artistas,
      faixas: a.faixas.map(function(f){
        var linhas = f.lrc ? LetraLRC.comPausas(LetraLRC.ler(f.lrc).linhas) : null;
        return { numero: f.numero, titulo: f.titulo, idioma: f.idioma, tom: f.tom, duracao: f.duracao, linhas: linhas };
      })
    });
    camada('parear', false);
    if (primeiro){
      atual = 0;
      tela.posicao(0, 0, false);
      if (!liberado) camada('comecar', true), $('btComecar').focus();
    } else tela.posicao(atual, audio.currentTime || 0, !audio.paused);
    contarEstado();
  }

  function fim(){
    audio.pause(); audio.removeAttribute('src');
    try { audio.load(); } catch (e) {}
    album = null; links = {}; atual = 0;
    if (ws){ var w = ws; ws = null; sessao = null; try { w.close(); } catch (e) {} }
    camada('comecar', false);
    novaSessao();
  }

  function avisar(texto){
    tela.aviso(texto);
    clearTimeout(avisoTempo);
    avisoTempo = setTimeout(function(){ tela.aviso(''); }, AVISO_MS);
  }

  // ----- Áudio -----
  var atual = 0, liberado = false, retomarEm = -1, querTocar = false, ultimaRenovacao = 0;

  function comLink(i, f){
    var faixa = album && album.faixas[i];
    if (!faixa) return;
    // link ainda vale por mais 2 minutos: usa; senão pede a esta e à seguinte
    if (links[faixa.id] && linksExpiram - Date.now() > 120000) return f(links[faixa.id]);
    esperandoLinks.push(function(){ if (links[faixa.id]) f(links[faixa.id]); });
    enviar({ tipo: 'links', faixas: [i, i + 1] });
  }

  function carregar(i, t, tocar){
    if (!album || !album.faixas[i]) return;
    atual = i; querTocar = tocar;
    retomarEm = t > 0 ? t : -1;
    tela.posicao(i, t || 0, false);
    comLink(i, function(url){
      if (atual !== i) return;
      audio.src = url;
      if (querTocar) tocar_(); else contarEstado();
    });
  }

  function tocar_(){
    querTocar = true;
    var p;
    try { p = audio.play(); } catch (e) { p = null; }
    // o navegador ainda não deixou tocar: falta o OK na TV
    if (p && p.then) p.then(function(){ liberado = true; camada('comecar', false); }, function(e){
      if (e && e.name === 'NotAllowedError'){ liberado = false; camada('comecar', true); $('btComecar').focus(); }
    });
  }
  function pausar(){ querTocar = false; audio.pause(); }
  function alternar(){
    if (!album) return;
    if (audio.paused){ if (!audio.getAttribute('src')) carregar(atual, 0, true); else tocar_(); }
    else pausar();
  }
  function anterior(){
    if ((audio.currentTime || 0) > 3){ irPara(atual, 0); return; }
    carregar(Math.max(0, atual - 1), 0, !audio.paused || querTocar);
  }
  function proxima(){
    if (!album || atual >= album.faixas.length - 1) return;
    carregar(atual + 1, 0, !audio.paused || querTocar);
  }
  function irPara(i, t){
    var tocando = !audio.paused || querTocar;
    if (i !== atual || !audio.getAttribute('src')){ carregar(i, t, tocando || !liberado); return; }
    try { audio.currentTime = Math.max(0, t); } catch (e) {}
    tela.posicao(i, Math.max(0, t), !audio.paused);
    contarEstado();
  }
  function pular(segundos){
    if (!audio.getAttribute('src')) return;
    var t = Math.max(0, Math.min((audio.duration || 0) - 1, (audio.currentTime || 0) + segundos));
    irPara(atual, t);
  }

  function executar(m){
    if (m.acao === 'alternar') alternar();
    else if (m.acao === 'tocar'){ if (audio.paused) alternar(); }
    else if (m.acao === 'pausar') pausar();
    else if (m.acao === 'anterior') anterior();
    else if (m.acao === 'proxima') proxima();
    else if (m.acao === 'ir') irPara(Math.floor(m.faixa) || 0, Number(m.t) || 0);
  }

  // conta ao celular (pela sala) onde a TV está
  var ultimoEstado = 0;
  function contarEstado(){
    if (!album) return;
    ultimoEstado = Date.now();
    enviar({ tipo: 'estado', faixa: atual, t: audio.currentTime || 0, tocando: !audio.paused });
  }

  audio.addEventListener('loadedmetadata', function(){
    if (retomarEm > 0){ try { audio.currentTime = retomarEm; } catch (e) {} retomarEm = -1; }
    if (album && audio.duration) tela.duracao(atual, audio.duration);
  });
  audio.addEventListener('playing', function(){ liberado = true; camada('comecar', false); tela.posicao(atual, audio.currentTime, true); contarEstado(); });
  audio.addEventListener('pause', function(){ tela.posicao(atual, audio.currentTime, false); contarEstado(); });
  audio.addEventListener('seeked', function(){ tela.posicao(atual, audio.currentTime, !audio.paused); contarEstado(); });
  audio.addEventListener('timeupdate', function(){
    if (!audio.paused && Date.now() - ultimoEstado > ESTADO_A_CADA_MS){ tela.posicao(atual, audio.currentTime, true); contarEstado(); }
  });
  audio.addEventListener('ended', function(){
    if (album && atual < album.faixas.length - 1) carregar(atual + 1, 0, true);
    else { querTocar = false; contarEstado(); } // fim do álbum
  });
  // link vencido (pausa longa) ou rede instável: pede um link novo e continua de onde parou
  audio.addEventListener('error', function(){
    if (!audio.getAttribute('src') || !album) return;
    if (Date.now() - ultimaRenovacao < 30000){ avisar('Não deu para tocar esta faixa agora. Tente de novo em instantes.'); return; }
    ultimaRenovacao = Date.now();
    var i = atual, t = audio.currentTime || 0, tocar = querTocar;
    delete links[album.faixas[i].id];
    carregar(i, t, tocar);
  });

  // ----- Controle remoto da TV -----
  // OK = tocar/pausar · ← → = faixa anterior/próxima (segurando: volta/adianta) · ↑ ↓ = mostra/esconde a barra
  var TECLAS = {
    13: 'ok', 32: 'ok',
    37: 'esquerda', 39: 'direita', 38: 'cima', 40: 'baixo',
    415: 'tocar', 19: 'pausar', 10252: 'alternar', 179: 'alternar', 413: 'pausar',
    412: 'voltar10', 417: 'adiantar10', 227: 'voltar10', 228: 'adiantar10',
    176: 'proxima', 10233: 'proxima', 177: 'anterior', 10232: 'anterior'
  };
  var segurando = {};
  document.addEventListener('keydown', function(e){
    var acao = TECLAS[e.keyCode];
    if (!acao) return;
    // "Aperte OK para começar": qualquer tecla de tocar libera o som
    if ($('comecar').className.indexOf('visivel') >= 0 && (acao === 'ok' || acao === 'tocar' || acao === 'alternar')){
      e.preventDefault(); comecar(); return;
    }
    if (!album) return;
    e.preventDefault();
    if (acao === 'esquerda' || acao === 'direita'){
      var s = segurando[acao];
      if (!s){ segurando[acao] = { desde: Date.now(), pulou: false, ultimo: 0 }; return; }
      if (Date.now() - s.desde > SEGURAR_MS && Date.now() - s.ultimo > 300){
        s.pulou = true; s.ultimo = Date.now();
        pular(acao === 'direita' ? PULO_SEGUNDOS : -PULO_SEGUNDOS);
      }
      return;
    }
    if (acao === 'ok' || acao === 'alternar') alternar();
    else if (acao === 'tocar'){ if (audio.paused) alternar(); }
    else if (acao === 'pausar') pausar();
    else if (acao === 'proxima') proxima();
    else if (acao === 'anterior') anterior();
    else if (acao === 'voltar10') pular(-PULO_SEGUNDOS);
    else if (acao === 'adiantar10') pular(PULO_SEGUNDOS);
    else if (acao === 'cima') document.body.className = '';
    else if (acao === 'baixo') document.body.className = 'sem-barra';
  });
  document.addEventListener('keyup', function(e){
    var acao = TECLAS[e.keyCode], s = acao && segurando[acao];
    if (!s) return;
    delete segurando[acao];
    if (!s.pulou){ if (acao === 'direita') proxima(); else anterior(); }
  });

  function comecar(){
    camada('comecar', false);
    liberado = true;
    if (audio.getAttribute('src')) tocar_(); else carregar(atual, retomarEm > 0 ? retomarEm : 0, true);
  }
  $('btComecar').addEventListener('click', comecar);

  // ----- Início -----
  if (sessao && sessao.sala){ mostrarCodigo(sessao.sala); situacao('Reconectando…'); conectar(); }
  else novaSessao();
})();
