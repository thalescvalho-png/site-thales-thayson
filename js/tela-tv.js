// Tela da TV: capa de fundo, letra sincronizada no estilo Spotify e a barra do álbum inteiro.
//
// É um componente independente: não toca nada nem sabe de onde vem o som. Quem usa informa
// "faixa i, segundo t, tocando sim/não" e a tela anda sozinha entre uma informação e outra.
// Usado por:
//   - tv/index.html (Modo TV, no navegador da TV), alimentado pelo <audio> da própria TV;
//   - correnteza.html, no painel "Na TV" do celular (versão compacta), alimentado pelo Chromecast,
//     pela AirPlay ou pela TV do Modo TV;
//   - FASE 2: tv/receiver.html (receptor próprio do Google Cast). Basta criar a tela e ligar os eventos
//     do PlayerManager do CAF Receiver SDK a tela.posicao(...). Veja "Fase 2" no README.
//
//   var tela = TelaTV.criar(elemento, {
//     compacta: false,            // true = layout do celular
//     leve: true,                 // TVs: menos efeitos (barra sem brilho borrado, 30 quadros por segundo)
//     capa: 'img/tv/capa-1024.jpg', fundo: 'img/tv/capa-fundo.jpg',
//     aoPular: function(i){},     // tocou num trecho da barra (só no celular)
//     aoBuscar: function(i, t){}  // arrastou a barra até a faixa i, segundo t (só no celular)
//   });
//   tela.album({ titulo, artistas, faixas: [{ numero, titulo, tom, duracao, linhas }] });
//   tela.letra(i, linhas);        // linhas de LetraLRC.comPausas(...), ou null = faixa sem .lrc (só capa e título)
//   tela.duracao(i, segundos);    // quando a duração só é conhecida depois
//   tela.posicao(i, t, tocando);  // a cada mudança e de tempos em tempos (a tela interpola entre um e outro)
//   tela.aviso('texto' | '');     // faixa de aviso no topo ("Pausado: começou a tocar em outro aparelho")
// Precisa de js/letra-lrc.js e js/bioluz.js. Escrito em JavaScript antigo (ES5): roda nos navegadores de TV.
(function(){
  // ===== AJUSTES =====
  var FOCO_VERSO = .42;          // altura do verso atual na área da letra (0 = topo, 1 = base)
  var QUADROS_LEVE = 30;         // quadros por segundo no modo leve (TV)
  var TOM_PADRAO = '#C68B3E';    // --ambar: cor quando a faixa não tem cor própria
  var ARRASTO_MINIMO = 8;        // px que o dedo anda antes de virar "arrastar" (senão é um toque)
  // tamanhos, cores e a velocidade da rolagem ficam em css/tela-tv.css (variáveis --ttv-...)

  var L = window.LetraLRC;

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function dois(n){ return (n < 10 ? '0' : '') + n; }
  function formatar(s){
    if (!isFinite(s) || s < 0) s = 0;
    return Math.floor(s / 60) + ':' + dois(Math.floor(s % 60));
  }
  function agora(){ return window.performance && performance.now ? performance.now() : Date.now(); }
  function corValida(c){ return /^#[0-9a-f]{6}$/i.test(c || '') ? c : TOM_PADRAO; }

  function criar(raiz, opcoes){
    opcoes = opcoes || {};
    var leve = !!opcoes.leve, compacta = !!opcoes.compacta;
    var album = { titulo: '', artistas: '', faixas: [] };
    var faixa = -1, base = 0, quando = agora(), tocando = false;
    var versos = [], linhas = null, versoAtual = -2, mostrada = -1;
    var arrastando = null; // { x, i, t } enquanto o dedo arrasta a barra
    var ultimoQuadro = 0, laco = 0, textoTempo = '', vivo = true;

    // ----- Estrutura -----
    var tela = el('div', 'ttv' + (compacta ? ' compacta' : '') + (leve ? ' leve' : ''));
    var fundo = el('div', 'ttv-fundo'); fundo.setAttribute('aria-hidden', 'true');
    if (opcoes.fundo) fundo.style.backgroundImage = 'url("' + opcoes.fundo + '")';
    tela.appendChild(fundo);
    tela.appendChild(el('div', 'ttv-veu'));

    var lado = el('div', 'ttv-lado');
    var capa = el('img', 'ttv-capa'); capa.alt = ''; if (opcoes.capa) capa.src = opcoes.capa;
    var info = el('div', 'ttv-info');
    var num = el('p', 'ttv-num'), titulo = el('h1', 'ttv-titulo'), artistas = el('p', 'ttv-artistas');
    info.appendChild(num); info.appendChild(titulo); info.appendChild(artistas);
    lado.appendChild(capa); lado.appendChild(info);
    tela.appendChild(lado);

    var areaLetra = el('div', 'ttv-letra');
    var lista = el('ol', 'ttv-versos');
    lista.setAttribute('aria-live', 'off');
    areaLetra.appendChild(lista);
    tela.appendChild(areaLetra);

    var baseEl = el('div', 'ttv-base');
    var tempos = el('div', 'ttv-tempos');
    var tempoFaixa = el('span', 'ttv-tempo-faixa'), tempoAlbum = el('span', 'ttv-tempo-album');
    tempos.appendChild(tempoFaixa); tempos.appendChild(tempoAlbum);
    var barra = el('div', 'ttv-barra');
    var canvas = el('canvas'); canvas.setAttribute('aria-hidden', 'true');
    var trechos = el('div', 'ttv-trechos');
    barra.appendChild(canvas); barra.appendChild(trechos);
    baseEl.appendChild(tempos); baseEl.appendChild(barra);
    tela.appendChild(baseEl);

    var avisoEl = el('p', 'ttv-aviso'); avisoEl.setAttribute('role', 'status');
    tela.appendChild(avisoEl);
    raiz.appendChild(tela);

    // a barra do álbum inteiro: a mesma correnteza viva do player do site
    var bio = window.Bioluz(compacta ? 7 : 12, { leve: leve });
    bio.ligar(canvas);

    // ----- Tempo -----
    function duracaoDe(i){
      var f = album.faixas[i];
      if (f && f.duracao > 0) return f.duracao;
      // faixa ainda sem duração conhecida: usa a média das outras (ou 3 min e meio)
      var soma = 0, n = 0;
      album.faixas.forEach(function(g){ if (g.duracao > 0){ soma += g.duracao; n++; } });
      return n ? soma / n : 210;
    }
    function inicioDe(i){ var s = 0; for (var k = 0; k < i; k++) s += duracaoDe(k); return s; }
    function total(){ return inicioDe(album.faixas.length); }
    function tempoAgora(){
      var t = base + (tocando ? (agora() - quando) / 1000 : 0);
      return Math.max(0, Math.min(duracaoDe(faixa), t));
    }

    // ----- Faixa atual: capa, título e letra -----
    function mostrarFaixa(i){
      var f = album.faixas[i];
      if (!f) return;
      mostrada = i;
      var tom = corValida(f.tom);
      tela.style.setProperty('--ttv-tom', tom);
      bio.cor(tom);
      num.textContent = 'Faixa ' + dois(f.numero) + ' de ' + dois(album.faixas.length);
      titulo.textContent = f.titulo;
      artistas.textContent = album.artistas + (album.titulo ? ' · ' + album.titulo : '');
      if (f.idioma) areaLetra.setAttribute('lang', f.idioma); else areaLetra.removeAttribute('lang');
      montarLetra(f.linhas);
      [].forEach.call(trechos.children, function(t, k){ t.className = 'ttv-trecho' + (k === i ? ' atual' : k < i ? ' passou' : ''); });
    }

    function montarLetra(ls){
      linhas = ls && ls.length && ls.some(function(l){ return !l.pausa; }) ? ls : null;
      lista.textContent = '';
      versos = []; versoAtual = -2;
      lista.style.transform = 'translate3d(0,0,0)';
      // faixa sem .lrc: só a capa e o título, maiores
      tela.className = tela.className.replace(/\s*sem-letra/g, '') + (linhas ? '' : ' sem-letra');
      if (!linhas) return;
      linhas.forEach(function(l){
        var li = el('li', 'ttv-verso' + (l.pausa ? ' pausa' : ''), l.texto);
        if (l.pausa) li.setAttribute('aria-hidden', 'true');
        lista.appendChild(li);
        versos.push(li);
      });
      // a primeira rolagem não anima (a letra já aparece no lugar)
      lista.className = 'ttv-versos sem-transicao';
      marcar(L.indice(linhas, tempoAgora()));
      requestAnimationFrame(function(){ lista.className = 'ttv-versos'; });
    }

    // verso atual aceso e centralizado; os cantados apagam, os próximos ficam levemente visíveis
    function marcar(i){
      versoAtual = i;
      for (var k = 0; k < versos.length; k++){
        versos[k].className = 'ttv-verso' + (linhas[k].pausa ? ' pausa' : '') + (k < i ? ' cantado' : k === i ? ' atual' : k === i + 1 ? ' proximo' : '');
      }
      var li = versos[Math.max(0, i)];
      if (!li) return;
      var desloca = li.offsetTop + li.offsetHeight / 2 - areaLetra.clientHeight * FOCO_VERSO;
      lista.style.transform = 'translate3d(0,' + (-Math.max(0, desloca)).toFixed(1) + 'px,0)';
    }

    // ----- Barra do álbum em trechos, com os nomes das faixas -----
    function montarTrechos(){
      trechos.textContent = '';
      var soma = total() || 1;
      album.faixas.forEach(function(f, i){
        var t = el('div', 'ttv-trecho');
        t.style.width = (duracaoDe(i) / soma * 100).toFixed(3) + '%';
        var nome = el('span', 'ttv-trecho-nome');
        nome.appendChild(el('b', '', dois(f.numero)));
        nome.appendChild(el('span', '', ' ' + f.titulo));
        t.appendChild(nome);
        t.title = f.titulo;
        t.style.setProperty('--ttv-tom-trecho', corValida(f.tom));
        trechos.appendChild(t);
      });
      if (mostrada >= 0) mostrarFaixa(mostrada);
    }

    // no celular: tocar num trecho pula para a faixa; arrastar adianta ou volta (no álbum inteiro)
    function pontoNaBarra(x){
      var r = barra.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (x - r.left) / (r.width || 1))), alvo = p * total();
      for (var i = 0; i < album.faixas.length; i++){
        var d = duracaoDe(i);
        if (alvo < d || i === album.faixas.length - 1) return { i: i, t: Math.min(alvo, d - .5) };
        alvo -= d;
      }
      return { i: 0, t: 0 };
    }
    if (opcoes.aoPular || opcoes.aoBuscar){
      tela.className += ' controlavel';
      var inicioX = 0, pressionado = false;
      barra.addEventListener('pointerdown', function(e){
        pressionado = true; inicioX = e.clientX; arrastando = null;
        if (barra.setPointerCapture) barra.setPointerCapture(e.pointerId);
      });
      barra.addEventListener('pointermove', function(e){
        if (!pressionado) return;
        if (!arrastando && Math.abs(e.clientX - inicioX) < ARRASTO_MINIMO) return;
        arrastando = pontoNaBarra(e.clientX);
        tela.className = tela.className.replace(/\s*arrastando/g, '') + ' arrastando';
        desenharTempos(true);
      });
      function soltar(e, cancelou){
        if (!pressionado) return;
        pressionado = false;
        tela.className = tela.className.replace(/\s*arrastando/g, '');
        var ponto = pontoNaBarra(e.clientX), arrastou = arrastando;
        arrastando = null;
        if (cancelou) return;
        if (arrastou){ if (opcoes.aoBuscar) opcoes.aoBuscar(ponto.i, ponto.t); }
        else if (opcoes.aoPular) opcoes.aoPular(ponto.i);
      }
      barra.addEventListener('pointerup', function(e){ soltar(e, false); });
      barra.addEventListener('pointercancel', function(e){ soltar(e, true); });
    }

    // ----- Desenho (um laço só, leve) -----
    function desenharTempos(forcar){
      var t = arrastando ? arrastando.t : tempoAgora(), i = arrastando ? arrastando.i : faixa;
      var texto = formatar(t) + '|' + formatar(inicioDe(i) + t);
      if (!forcar && texto === textoTempo) return;
      textoTempo = texto;
      tempoFaixa.textContent = formatar(t) + ' / ' + formatar(duracaoDe(i));
      tempoAlbum.textContent = 'álbum ' + formatar(inicioDe(i) + t) + ' / ' + formatar(total());
    }
    function quadro(ms){
      if (!vivo) return;
      laco = requestAnimationFrame(quadro);
      if (leve && ms - ultimoQuadro < 1000 / QUADROS_LEVE - 2) return;
      var dt = ultimoQuadro ? Math.min(50, ms - ultimoQuadro) / 16.7 : 1;
      ultimoQuadro = ms;
      if (faixa < 0 || !album.faixas.length) return;
      var t = tempoAgora();
      if (linhas){
        var i = L.indice(linhas, t);
        if (i !== versoAtual) marcar(i);
      }
      desenharTempos(false);
      var p = arrastando ? (inicioDe(arrastando.i) + arrastando.t) / total() : (inicioDe(faixa) + t) / total();
      bio.quadro(dt, p, tocando && !arrastando);
    }
    laco = requestAnimationFrame(quadro);
    // a letra muda de altura quando a janela muda (girar o celular, zoom da TV)
    window.addEventListener('resize', function(){ if (linhas) marcar(versoAtual); });

    return {
      elemento: tela,
      album: function(d){
        album = { titulo: d.titulo || '', artistas: d.artistas || '', faixas: (d.faixas || []).slice() };
        montarTrechos();
        if (faixa >= album.faixas.length) faixa = -1;
        if (faixa >= 0) mostrarFaixa(faixa);
      },
      letra: function(i, ls){
        if (!album.faixas[i]) return;
        album.faixas[i].linhas = ls || null;
        if (i === mostrada) montarLetra(album.faixas[i].linhas);
      },
      duracao: function(i, s){
        if (!album.faixas[i] || !(s > 0) || Math.abs((album.faixas[i].duracao || 0) - s) < .5) return;
        album.faixas[i].duracao = s;
        montarTrechos();
      },
      posicao: function(i, t, estaTocando){
        if (!album.faixas[i]) return;
        base = Math.max(0, Number(t) || 0); quando = agora(); tocando = !!estaTocando;
        faixa = i;
        tela.className = tela.className.replace(/\s*tocando/g, '') + (tocando ? ' tocando' : '');
        if (i !== mostrada) mostrarFaixa(i);
        else if (linhas) marcar(L.indice(linhas, base));
        desenharTempos(true);
      },
      aviso: function(texto){
        avisoEl.textContent = texto || '';
        tela.className = tela.className.replace(/\s*avisando/g, '') + (texto ? ' avisando' : '');
      },
      faixaAtual: function(){ return faixa; },
      tempo: tempoAgora,
      destruir: function(){
        vivo = false;
        cancelAnimationFrame(laco);
        bio.ligar(null);
        if (tela.parentNode) tela.parentNode.removeChild(tela);
      }
    };
  }

  window.TelaTV = { criar: criar, formatar: formatar };
})();
