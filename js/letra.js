// Tela da letra sincronizada: abre por cima da página e toca no mesmo <audio> do player (js/album.js),
// então abrir e fechar não para nem reinicia a música. O verso atual acende, a letra rola sozinha
// e tocar num verso pula para ele. A leitura do .lrc e o "verso atual" ficam em js/letra-lrc.js.
// Quem não comprou vê só o convite: nenhum verso é pedido à API.
(function(){
  var C = window.Correnteza, P = C && C.player, L = window.LetraLRC;
  var tela = document.getElementById('letraTela');
  if (!P || !L || !tela) return;

  function $(id){ return document.getElementById(id); }
  var audio = P.audio;
  var rolagem = $('letraRolagem'), conteudo = $('letraConteudo'), aoVivo = $('letraAoVivo');
  var titulo = $('letraTitulo'), sub = $('letraSub'), btFechar = $('letraFechar');
  var tempoAtual = $('letraTempoAtual'), tempoTotal = $('letraTempoTotal'), barra = $('letraBarra');
  var btTocar = $('letraTocar');
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');
  var bio = C.bioluz(9); // a mesma barra viva do player, desenhada no mesmo laço de animação
  var relogio = L.relogio(audio);

  var aberta = false, origem = null, mostrada = -1, pedido = 0, cache = {};
  var linhas = [], itens = [], versoAtual = -2;
  var arrastando = false;
  var pausaAte = 0, centralizado = -2, saltar = true, anima = 0, retomada = 0;
  var empurrado = false, ignorarVolta = false, restauracao = null, depois = null, inertes = [], escondendo = 0;

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function dois(n){ return (n < 10 ? '0' : '') + n; }
  function agora(){ return window.performance ? performance.now() : Date.now(); }

  // ----- Abrir e fechar -----
  C.abrirLetra = function(i, link){
    var f = P.faixas()[i];
    if (!f) return false;
    origem = link || null;
    if (!aberta) mostrarTela();
    // com o álbum, a faixa começa a tocar (ou segue de onde está); na prévia, só fica escolhida
    if (P.completo()) P.tocarFaixa(i);
    else P.escolher(i);
    if (mostrada !== P.atual()) mostrar(P.atual());
    else { saltar = true; centralizado = -2; sincronizar(); }
    return true;
  };

  function mostrarTela(){
    aberta = true;
    clearTimeout(escondendo);
    tela.hidden = false;
    document.documentElement.classList.add('letra-aberta');
    prender(true);
    bio.ligar($('bioLetra'));
    bio.cor(P.tom(P.atual()));
    botaoTocar(); tempos();
    P.pintar();
    // o "voltar" do celular fecha a tela em vez de sair da página
    try {
      restauracao = history.scrollRestoration || null;
      if (restauracao) history.scrollRestoration = 'manual';
      history.pushState({ letraTela: true }, '');
      empurrado = true;
    } catch (e) { empurrado = false; }
    // a tela sobe do player: parte um pouco abaixo e transparente, e desliza para o lugar
    void tela.offsetWidth;
    requestAnimationFrame(function(){ if (aberta) tela.classList.add('aberta'); });
    btFechar.focus();
  }

  function fechar(peloVoltar){
    if (!aberta) return;
    aberta = false;
    tela.classList.remove('aberta');
    // desce e some; só sai da página depois da animação
    clearTimeout(escondendo);
    escondendo = setTimeout(function(){ if (!aberta) tela.hidden = true; }, reduzir.matches ? 0 : 560);
    document.documentElement.classList.remove('letra-aberta');
    prender(false);
    bio.ligar(null);
    cancelAnimationFrame(anima); clearTimeout(retomada);
    // o foco volta ao link "letra" que abriu a tela (ou ao da faixa atual, se a lista foi refeita)
    var volta = origem && document.contains(origem) ? origem
      : document.querySelector('#faixas li:nth-child(' + (P.atual() + 1) + ') .ver-letra');
    if (volta) volta.focus();
    if (empurrado && !peloVoltar){ empurrado = false; ignorarVolta = true; history.back(); }
    else { empurrado = false; terminar(); }
  }
  function terminar(){
    if (restauracao){ history.scrollRestoration = restauracao; restauracao = null; }
    var f = depois; depois = null;
    if (f) f();
  }
  window.addEventListener('popstate', function(){
    if (ignorarVolta){ ignorarVolta = false; terminar(); return; }
    if (aberta){ empurrado = false; fechar(true); }
  });
  btFechar.addEventListener('click', function(){ fechar(); });

  // a capa e o nome da faixa no player fixo abrem a letra da faixa que está tocando
  var btPlayer = $('tocadorAbrirLetra');
  function abrirPeloPlayer(){ if (P.atual() >= 0) C.abrirLetra(P.atual(), btPlayer); }
  btPlayer.addEventListener('click', abrirPeloPlayer);
  document.querySelector('#tocador > img').addEventListener('click', abrirPeloPlayer);

  // ----- Foco preso na tela enquanto ela está aberta -----
  function prender(sim){
    if (sim){
      [].forEach.call(document.body.children, function(e){
        if (e === tela || e.tagName === 'SCRIPT' || e.inert || e.getAttribute('aria-hidden') === 'true') return;
        e.inert = true; e.setAttribute('aria-hidden', 'true');
        inertes.push(e);
      });
    } else {
      inertes.forEach(function(e){ e.inert = false; e.removeAttribute('aria-hidden'); });
      inertes = [];
    }
  }
  function focaveis(){
    return [].filter.call(tela.querySelectorAll('button, a[href], input'), function(e){
      return !e.disabled && e.getClientRects().length;
    });
  }
  tela.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); fechar(); return; }
    if (e.key !== 'Tab') return;
    var lista = focaveis(), primeiro = lista[0], ultimo = lista[lista.length - 1];
    if (!primeiro) return;
    if (e.shiftKey && document.activeElement === primeiro){ e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo){ e.preventDefault(); primeiro.focus(); }
  });
  // navegadores sem "inert": se o foco escapar, volta para a tela
  document.addEventListener('focusin', function(e){
    if (aberta && !tela.contains(e.target)) btFechar.focus();
  });

  // ----- A letra da faixa -----
  // a letra só é pedida por quem tem o código; 404 = a faixa ainda não tem .lrc
  function letraDe(f){
    if (!cache[f.id]){
      var p = fetch(C.api + '/api/letra/' + encodeURIComponent(f.id + '.lrc') + C.consulta(), { cache: 'no-store' })
        .then(function(r){
          if (r.status === 404) return '';
          if (!r.ok) throw new Error('letra_' + r.status);
          return r.text();
        })
        .then(function(texto){ return texto ? L.comPausas(L.ler(texto).linhas) : []; });
      cache[f.id] = p;
      // sem conexão ou acesso recusado: tenta de novo na próxima vez
      p.catch(function(){ if (cache[f.id] === p) delete cache[f.id]; });
    }
    return cache[f.id].catch(function(){ return []; });
  }
  C.aoCarregar(function(){ cache = {}; if (aberta) mostrar(P.atual()); else mostrada = -1; });
  // o painel "Na TV" (js/transmitir.js) usa a mesma letra, já pronta: [] = faixa sem .lrc
  C.letraDe = function(i){ var f = P.faixas()[i]; return f && P.completo() ? letraDe(f) : Promise.resolve([]); };

  function mostrar(i){
    var f = P.faixas()[i];
    if (!f) return;
    mostrada = i;
    var tom = P.tom(i);
    tela.style.setProperty('--tom', tom);
    bio.cor(tom);
    titulo.textContent = f.titulo;
    sub.textContent = 'Correnteza · faixa ' + dois(f.numero);
    conteudo.lang = f.idioma || 'pt-BR';
    tempos();
    linhas = []; itens = []; versoAtual = -2; centralizado = -2; saltar = true;
    aoVivo.textContent = '';
    conteudo.textContent = '';
    conteudo.classList.remove('sincronizada');
    rolagem.scrollTop = 0;
    var completo = P.completo();
    tela.classList.toggle('convite', !completo);
    if (!completo){ convite(); return; }

    var este = ++pedido;
    conteudo.setAttribute('aria-busy', 'true');
    letraDe(f).then(function(ls){
      if (este !== pedido) return;
      conteudo.removeAttribute('aria-busy');
      if (ls.some(function(l){ return !l.pausa; })) versos(ls);
      else if (f.letra && f.letra.length) estatica(f.letra);
      else conteudo.appendChild(el('p', 'letra-aviso', 'Letra em breve'));
    });
  }

  function oculto(texto){ return el('span', 'visualmente-oculto', texto); }
  function versos(ls){
    linhas = ls;
    var ol = el('ol', 'letra-versos');
    ls.forEach(function(l){
      var li = el('li', 'letra-verso' + (l.pausa ? ' pausa' : ''));
      var b = el('button');
      b.type = 'button';
      if (l.pausa){
        b.appendChild(el('span', '', l.texto)).setAttribute('aria-hidden', 'true');
        b.appendChild(oculto('Trecho instrumental. Ir para ' + P.formatar(l.t)));
      } else {
        b.appendChild(document.createTextNode(l.texto));
        b.appendChild(oculto('. Ir para ' + P.formatar(l.t)));
      }
      b.addEventListener('click', function(){ pular(l.t); });
      li.appendChild(b);
      ol.appendChild(li);
      itens.push(li);
    });
    conteudo.classList.add('sincronizada');
    conteudo.appendChild(ol);
    sincronizar();
  }

  // faixa sem .lrc: a letra do encarte, parada
  function estatica(estrofes){
    var d = el('div', 'letra-estatica');
    estrofes.forEach(function(estrofe){
      var p = el('p');
      estrofe.forEach(function(verso, j){
        if (j) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(verso));
      });
      d.appendChild(p);
    });
    conteudo.appendChild(d);
    conteudo.appendChild(el('p', 'letra-nota', 'A letra sincronizada desta faixa chega em breve.'));
  }

  // modo prévia: capa desfocada ao fundo e o convite
  function convite(){
    var c = el('div', 'letra-convite');
    c.appendChild(el('p', 'letra-convite-texto', 'A letra completa faz parte do álbum'));
    var a = el('a', 'botao', 'Adquirir o álbum');
    a.href = '#apoie';
    a.addEventListener('click', function(e){
      e.preventDefault();
      depois = function(){
        $('btAdquirir').click();
        $('apoie').scrollIntoView({ behavior: reduzir.matches ? 'auto' : 'smooth', block: 'start' });
      };
      fechar();
    });
    c.appendChild(a);
    conteudo.appendChild(c);
  }

  // ----- Verso atual e rolagem -----
  function sincronizar(){
    if (!aberta || !linhas.length) return;
    var i = L.indice(linhas, relogio.agora());
    if (i !== versoAtual) marcar(i);
    if (agora() >= pausaAte && centralizado !== versoAtual) centralizar();
  }
  function marcar(i){
    var antes = itens[versoAtual];
    if (antes) antes.firstChild.removeAttribute('aria-current');
    versoAtual = i;
    itens.forEach(function(li, k){
      li.classList.toggle('cantado', k < i);
      li.classList.toggle('atual', k === i);
    });
    if (itens[i]) itens[i].firstChild.setAttribute('aria-current', 'true');
    // leitor de tela: anuncia só quando o verso muda (e não as pausas)
    var l = linhas[i];
    aoVivo.textContent = l && !l.pausa ? l.texto : '';
  }
  // o verso atual fica um pouco acima do meio da tela
  function centralizar(){
    centralizado = versoAtual;
    var li = itens[Math.max(0, versoAtual)];
    if (!li) return;
    var alvo = li.offsetTop + li.offsetHeight / 2 - rolagem.clientHeight * .38;
    alvo = Math.max(0, Math.min(rolagem.scrollHeight - rolagem.clientHeight, alvo));
    cancelAnimationFrame(anima);
    if (saltar || reduzir.matches){ saltar = false; rolagem.scrollTop = alvo; return; }
    var inicio = rolagem.scrollTop, d = alvo - inicio, t0 = agora();
    if (Math.abs(d) < 1) return;
    var duracao = Math.min(900, 450 + Math.abs(d) * .5);
    (function passo(){
      var p = Math.min(1, (agora() - t0) / duracao);
      rolagem.scrollTop = inicio + d * (1 - Math.pow(1 - p, 3));
      if (p < 1) anima = requestAnimationFrame(passo);
    })();
  }
  // a pessoa rolou a letra: a rolagem automática espera 4 s e volta ao verso atual
  function mexeu(){
    pausaAte = agora() + 4000;
    centralizado = -2;
    cancelAnimationFrame(anima);
    clearTimeout(retomada);
    retomada = setTimeout(sincronizar, 4050);
  }
  rolagem.addEventListener('wheel', mexeu, { passive: true });
  rolagem.addEventListener('touchmove', mexeu, { passive: true });
  rolagem.addEventListener('pointerdown', function(e){ if (e.target === rolagem) mexeu(); }); // barra de rolagem
  rolagem.addEventListener('keydown', function(e){
    if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) mexeu();
  });
  window.addEventListener('resize', function(){ if (aberta){ saltar = true; centralizado = -2; sincronizar(); } });

  function pular(t){
    pausaAte = 0; centralizado = -2;
    audio.currentTime = t + .05;
    if (audio.paused) P.alternar();
    sincronizar();
  }

  // ----- Rodapé: a mesma barra viva, tempos e botões do player -----
  function progresso(){
    if (arrastando) return barra.value / 100;
    return audio.duration ? audio.currentTime / audio.duration : 0;
  }
  P.desenhar(function(dt, tocando){
    if (!aberta) return;
    bio.quadro(dt, progresso(), tocando);
    sincronizar();
  });
  P.aoTrocar(function(i){ if (aberta) mostrar(i); else mostrada = -1; });

  function tempos(){
    tempoTotal.textContent = P.formatar(audio.duration);
    if (arrastando) return;
    barra.value = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
    tempoAtual.textContent = P.formatar(audio.currentTime);
  }
  function botaoTocar(){
    btTocar.innerHTML = audio.paused ? '&#9654;&#xFE0E;' : '&#10074;&#10074;';
    btTocar.setAttribute('aria-label', audio.paused ? 'Tocar' : 'Pausar');
  }
  audio.addEventListener('timeupdate', function(){ if (aberta) tempos(); });
  audio.addEventListener('durationchange', function(){ if (aberta) tempos(); });
  audio.addEventListener('seeked', function(){ if (aberta){ centralizado = -2; sincronizar(); } });
  audio.addEventListener('play', botaoTocar);
  audio.addEventListener('pause', botaoTocar);

  barra.addEventListener('input', function(){
    arrastando = true;
    if (audio.duration) tempoAtual.textContent = P.formatar(barra.value / 100 * audio.duration);
    if (audio.paused) P.pintar();
  });
  barra.addEventListener('change', function(){
    if (audio.duration) audio.currentTime = barra.value / 100 * audio.duration;
    arrastando = false;
    pausaAte = 0; centralizado = -2;
    sincronizar();
  });
  btTocar.addEventListener('click', function(){ P.alternar(); });
  $('letraAnterior').addEventListener('click', function(){ P.anterior(); });
  $('letraProxima').addEventListener('click', function(){ P.proxima(); });
})();
