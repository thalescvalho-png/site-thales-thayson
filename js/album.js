// Página do álbum: código de acesso, lista de faixas, player e encarte.
// Tudo vem da API de venda (backend/): prévias de 15 s para todos e, com um código válido,
// as faixas completas, os downloads e as letras. js/compra.js usa window.Correnteza.
(function(){
  var API = (document.querySelector('meta[name="correnteza-api"]') || {}).content || '';
  API = API.replace(/\/$/, '');

  // ----- 1. Guardar o código e o identificador deste aparelho -----
  // O identificador é criado uma vez e fica no navegador: cada um conta como um aparelho no limite do código.
  var memoria = {};
  function ler(chave){ try { return localStorage.getItem(chave); } catch (e) { return memoria[chave] || null; } }
  function gravar(chave, valor){
    try { if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor); }
    catch (e) { if (valor === null) delete memoria[chave]; else memoria[chave] = valor; }
  }
  function novoId(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return [].map.call(b, function(x){ return (x + 256).toString(16).slice(1); }).join('');
  }
  function aparelho(){
    var id = ler('correnteza.aparelho');
    if (!id){ id = novoId(); gravar('correnteza.aparelho', id); }
    return id;
  }

  // o link do e-mail chega como correnteza.html?codigo=XXXX: guarda o código e o tira do endereço
  var params = new URLSearchParams(location.search);
  if (params.get('codigo')){
    gravar('correnteza.codigo', params.get('codigo').trim());
    params.delete('codigo');
    var resto = params.toString();
    history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
  }

  // ----- 2. Conversa com a API -----
  var ouvintes = [];
  var dados = null;

  function pedirJson(caminho, opcoes){
    return fetch(API + caminho, opcoes).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(corpo){ corpo._status = r.status; return corpo; });
    });
  }

  function carregar(){
    var codigo = ler('correnteza.codigo');
    var q = codigo ? '?token=' + encodeURIComponent(codigo) + '&aparelho=' + encodeURIComponent(aparelho()) : '';
    return pedirJson('/api/album' + q, codigo ? { cache: 'no-store' } : undefined).then(function(d){
      if (!d.faixas) throw new Error(d.mensagem || 'album_indisponivel');
      // código recusado de vez: esquece para não tentar de novo a cada visita
      if (codigo && !d.acesso && (d.motivo === 'codigo_invalido' || d.motivo === 'sem_codigo')) gravar('correnteza.codigo', null);
      if (d.acesso && d.codigo) gravar('correnteza.codigo', d.codigo);
      dados = d;
      document.body.classList.toggle('com-acesso', !!d.acesso);
      ouvintes.forEach(function(f){ f(d, codigo); });
      return d;
    });
  }

  window.Correnteza = {
    api: API,
    pedirJson: pedirJson,
    carregar: carregar,
    dados: function(){ return dados; },
    aoCarregar: function(f){ ouvintes.push(f); if (dados) f(dados); },
    usarCodigo: function(codigo){ gravar('correnteza.codigo', codigo); return carregar(); },
    sair: function(){ gravar('correnteza.codigo', null); return carregar(); },
    ler: ler,
    gravar: gravar
  };
})();

// ----- 3. Lista de faixas e player -----
(function(){
  var C = window.Correnteza;
  var audio = document.getElementById('audio');
  var lista = document.getElementById('faixas');
  var tocador = document.getElementById('tocador');
  var btTocar = document.getElementById('btTocar');
  var btAnterior = document.getElementById('btAnterior');
  var btProxima = document.getElementById('btProxima');
  var barra = document.getElementById('barra');
  var tempoAtual = document.getElementById('tempoAtual');
  var tempoTotal = document.getElementById('tempoTotal');
  var titulo = document.getElementById('tocadorTitulo');
  var sub = document.getElementById('tocadorSub');
  var aviso = document.getElementById('avisoPlayer');
  var faixas = [];
  var completo = false;
  var atual = -1;
  var arrastando = false;

  function dois(n){ return (n < 10 ? '0' : '') + n; }
  function formatar(s){
    if (!isFinite(s)) return '0:00';
    return Math.floor(s / 60) + ':' + dois(Math.floor(s % 60));
  }
  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function itens(){ return [].slice.call(lista.children); }

  function montar(d){
    var tocando = !audio.paused;
    var idAtual = atual >= 0 && faixas[atual] ? faixas[atual].id : null;
    faixas = d.faixas;
    completo = !!d.acesso;
    lista.textContent = '';
    faixas.forEach(function(f, i){
      var li = el('li', 'disponivel');
      var b = el('button', 'faixa');
      b.type = 'button';
      b.appendChild(el('span', 'num', dois(f.numero)));
      b.appendChild(el('span', 'nome', f.titulo));
      var estado = el('span', 'estado', completo ? '' : 'prévia');
      b.appendChild(estado);
      b.addEventListener('click', function(){ if (i === atual) alternar(); else carregarFaixa(i, true); });
      li.appendChild(b);
      if (completo){
        var letra = el('a', 'ver-letra', 'letra'); letra.href = '#letra-' + f.numero;
        var baixar = el('a', 'ver-letra', 'baixar'); baixar.href = f.download; baixar.setAttribute('download', '');
        baixar.setAttribute('aria-label', 'Baixar ' + f.titulo);
        var extras = el('span', 'faixa-extras');
        extras.appendChild(letra); extras.appendChild(baixar);
        li.appendChild(extras);
        // mostra a duração assim que ela for conhecida
        var sonda = new Audio(); sonda.preload = 'metadata'; sonda.src = f.audio;
        sonda.addEventListener('loadedmetadata', function(){ estado.textContent = formatar(sonda.duration); sonda.removeAttribute('src'); });
      }
      lista.appendChild(li);
    });
    tocador.classList.remove('bloqueado');
    [btTocar, btAnterior, btProxima, barra].forEach(function(b){ b.disabled = false; });
    aviso.textContent = completo
      ? 'Seu álbum completo. Toque numa faixa para ouvir ou baixe as músicas uma a uma.'
      : 'Ouça uma prévia de 15 segundos de cada faixa. O álbum completo fica disponível em primeira mão para quem adquire.';
    sub.textContent = completo ? 'Correnteza' : 'prévias de 15 segundos';

    // ao liberar o acesso no meio de uma prévia, segue na mesma faixa, agora completa
    var i = idAtual ? faixas.map(function(f){ return f.id; }).indexOf(idAtual) : -1;
    atual = -1;
    carregarFaixa(i >= 0 ? i : 0, tocando);
  }

  function carregarFaixa(i, tocarJa){
    var f = faixas[i];
    if (!f) return;
    atual = i;
    itens().forEach(function(x, j){
      x.classList.toggle('atual', j === i);
      var b = x.querySelector('.faixa');
      if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    audio.src = completo ? f.audio : f.previa;
    titulo.textContent = f.titulo;
    sub.textContent = 'Correnteza · faixa ' + dois(f.numero) + (completo ? '' : ' · prévia');
    barra.value = 0; tempoAtual.textContent = '0:00'; tempoTotal.textContent = '0:00';
    if ('mediaSession' in navigator){
      navigator.mediaSession.metadata = new MediaMetadata({
        title: f.titulo, artist: 'Thales Carvalho & Thayson Azevedo', album: 'Correnteza',
        artwork: [{ src: 'img/sem-ano_capa-album_correnteza.webp', sizes: '1600x1600', type: 'image/webp' }]
      });
    }
    if (tocarJa) audio.play().catch(function(){});
  }
  function alternar(){
    if (atual < 0){ carregarFaixa(0, true); return; }
    if (audio.paused) audio.play().catch(function(){}); else audio.pause();
  }
  function vizinha(passo){ return faixas.length ? (atual + passo + faixas.length) % faixas.length : -1; }

  btTocar.addEventListener('click', alternar);
  btAnterior.addEventListener('click', function(){
    if (audio.currentTime > 3){ audio.currentTime = 0; return; }
    carregarFaixa(vizinha(-1), true);
  });
  btProxima.addEventListener('click', function(){ carregarFaixa(vizinha(1), true); });

  audio.addEventListener('play', function(){ btTocar.innerHTML = '&#10074;&#10074;'; btTocar.setAttribute('aria-label', 'Pausar'); document.body.classList.add('tocando'); });
  audio.addEventListener('pause', function(){ btTocar.innerHTML = '&#9654;&#xFE0E;'; btTocar.setAttribute('aria-label', 'Tocar'); document.body.classList.remove('tocando'); });
  audio.addEventListener('loadedmetadata', function(){ tempoTotal.textContent = formatar(audio.duration); });
  audio.addEventListener('timeupdate', function(){
    if (arrastando || !audio.duration) return;
    barra.value = (audio.currentTime / audio.duration) * 100;
    tempoAtual.textContent = formatar(audio.currentTime);
  });
  audio.addEventListener('ended', function(){
    if (atual < faixas.length - 1) carregarFaixa(atual + 1, true); // para ao fim da última faixa
  });
  audio.addEventListener('error', function(){
    if (!audio.getAttribute('src')) return;
    sub.textContent = completo ? 'Não deu para tocar esta faixa agora. Tente de novo em instantes.' : 'Prévia indisponível no momento.';
  });
  barra.addEventListener('input', function(){
    arrastando = true;
    if (audio.duration) tempoAtual.textContent = formatar(barra.value / 100 * audio.duration);
  });
  barra.addEventListener('change', function(){
    if (audio.duration) audio.currentTime = barra.value / 100 * audio.duration;
    arrastando = false;
  });
  if ('mediaSession' in navigator){
    navigator.mediaSession.setActionHandler('play', function(){ audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function(){ audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', function(){ btAnterior.click(); });
    navigator.mediaSession.setActionHandler('nexttrack', function(){ btProxima.click(); });
  }

  C.aoCarregar(montar);
  C.pronto = C.carregar();
  C.pronto.catch(function(){
    aviso.textContent = 'Não foi possível carregar as prévias agora. Tente recarregar a página em instantes.';
  });
})();

// ----- 4. Encarte: com o código, as páginas com as letras surgem ao rolar e a névoa se move em camadas -----
(function(){
  var C = window.Correnteza;
  var encarte = document.getElementById('encarte');
  var original = encarte.innerHTML;
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var obs = null;
  var camadas = [];
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function svg(classe, viewBox, d, atributos){
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', classe); s.setAttribute('viewBox', viewBox);
    s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }
  function corValida(c){ return /^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : null; }

  function fundo(){
    var f = el('div', 'encarte-fundo'); f.setAttribute('aria-hidden', 'true');
    [['-0.18', 'n1'], ['0.12', 'n2'], ['-0.08', 'n3'], ['0.2', 'n4'], ['-0.14', 'n5']].forEach(function(c){
      var camada = el('div', 'camada-e'); camada.dataset.velocidade = c[0];
      camada.appendChild(el('span', 'nuvem ' + c[1]));
      f.appendChild(camada);
    });
    f.appendChild(svg('rio-e', '0 0 1440 3000', 'M720 0 C 420 380, 1080 700, 760 1100 S 380 1800, 700 2200 S 1060 2700, 720 3000'));
    return f;
  }

  function pagina(f){
    var art = el('article', 'pagina');
    art.id = 'letra-' + f.numero;
    if (f.cores){
      if (corValida(f.cores.tom)) art.style.setProperty('--tom', f.cores.tom);
      if (corValida(f.cores.tom2)) art.style.setProperty('--tom2', f.cores.tom2);
    }
    if (f.idioma) art.lang = f.idioma;
    var cab = el('header');
    cab.appendChild(el('span', 'num', (f.numero < 10 ? '0' : '') + f.numero));
    cab.appendChild(el('h3', '', f.titulo));
    art.appendChild(cab);
    art.appendChild(svg('onda', '0 0 400 24', 'M0 12 Q50 2 100 12 T200 12 T300 12 T400 12 T500 12 T600 12 T700 12 T800 12'));
    if (f.creditos){
      var partes = [];
      if (f.creditos.letra) partes.push('Letra: ' + f.creditos.letra);
      if (f.creditos.musica) partes.push('Música: ' + f.creditos.musica);
      art.appendChild(el('p', 'creditos', partes.join(' · ')));
    }
    var letra = el('div', 'letra');
    (f.letra || []).forEach(function(estrofe, i){
      var p = el('p');
      p.style.setProperty('--i', i);
      estrofe.forEach(function(verso, j){
        if (j) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(verso));
      });
      letra.appendChild(p);
    });
    art.appendChild(letra);
    return art;
  }

  function montar(d){
    if (obs){ obs.disconnect(); obs = null; }
    if (!d.acesso){
      encarte.classList.add('bloqueado');
      encarte.innerHTML = original;
      camadas = [];
      return;
    }
    encarte.classList.remove('bloqueado');
    encarte.textContent = '';
    encarte.appendChild(fundo());
    var dentro = el('div', 'encarte-in');
    dentro.appendChild(el('h2', '', 'Encarte'));
    dentro.appendChild(el('p', 'encarte-intro', 'Letras e créditos de cada faixa de Correnteza.'));
    d.faixas.forEach(function(f){ dentro.appendChild(pagina(f)); });
    encarte.appendChild(dentro);
    camadas = [].slice.call(encarte.querySelectorAll('.camada-e'));

    var paginas = [].slice.call(encarte.querySelectorAll('.pagina'));
    if (reduzir || !('IntersectionObserver' in window)){
      paginas.forEach(function(pg){ pg.classList.add('visivel'); });
    } else {
      obs = new IntersectionObserver(function(entradas){
        entradas.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('visivel'); obs.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -12% 0px' });
      paginas.forEach(function(pg){ obs.observe(pg); });
    }
    // quem chega por um link #letra-n vê a página já aberta
    abrirAlvo();
    mover();
  }

  function abrirAlvo(){
    if (!/^#letra-\d+$/.test(location.hash)) return;
    var alvo = document.getElementById(location.hash.slice(1));
    if (!alvo) return;
    alvo.classList.add('visivel');
    alvo.scrollIntoView();
  }
  window.addEventListener('hashchange', abrirAlvo);

  var pendente = false;
  function mover(){
    pendente = false;
    if (!camadas.length || reduzir) return;
    var r = encarte.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    var d = window.innerHeight - r.top;
    camadas.forEach(function(c){ c.style.transform = 'translate3d(0,' + (d * parseFloat(c.dataset.velocidade)).toFixed(1) + 'px,0)'; });
  }
  window.addEventListener('scroll', function(){ if (!pendente){ pendente = true; requestAnimationFrame(mover); } }, { passive: true });

  C.aoCarregar(montar);
})();
