// Página do álbum: código de acesso, lista de faixas, player e encarte.
// Tudo vem da API de venda (backend/): prévias de 15 s para todos e, com um código válido,
// as faixas completas, os downloads e as letras. js/compra.js usa window.Correnteza.
(function(){
  var API = (document.querySelector('meta[name="correnteza-api"]') || {}).content || '';
  API = API.replace(/\/$/, '');
  // testando no próprio computador: usa o backend local (npm run dev, na pasta backend)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = 'http://localhost:8787';

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
  var desvio = 0; // diferença entre o relógio do servidor e o deste aparelho

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
      if (d.agora) desvio = d.agora - Date.now();
      dados = d;
      document.body.classList.toggle('com-acesso', !!d.acesso);
      ouvintes.forEach(function(f){ f(d, codigo); });
      return d;
    });
  }

  function credenciais(){ return { token: ler('correnteza.codigo') || '', aparelho: aparelho() }; }
  function consulta(){
    var c = credenciais();
    return '?token=' + encodeURIComponent(c.token) + '&aparelho=' + encodeURIComponent(c.aparelho);
  }

  // Os links das faixas completas expiram em 30 minutos. Antes disso a página pede links novos,
  // sem recarregar a lista nem parar a música.
  var renovando = null;
  function linksVencendo(margem){
    return !!(dados && dados.acesso && dados.linksExpiram && dados.linksExpiram - (Date.now() + desvio) < margem);
  }
  function renovarLinks(){
    if (renovando) return renovando;
    if (!dados || !dados.acesso) return Promise.reject(new Error('sem_acesso'));
    renovando = pedirJson('/api/links' + consulta(), { cache: 'no-store' }).then(function(l){
      renovando = null;
      if (!l.faixas){
        // aparelho desconectado ou código desativado: a página volta ao estado sem acesso
        if (l._status === 401 || l._status === 403) carregar();
        throw new Error(l.erro || 'links_indisponiveis');
      }
      if (l.agora) desvio = l.agora - Date.now();
      l.faixas.forEach(function(n){
        dados.faixas.forEach(function(f){ if (f.id === n.id){ f.audio = n.audio; if (n.download) f.download = n.download; } });
      });
      if (dados.encarte){ dados.encarte.pdf = l.pdf; dados.encarte.json = l.json; }
      if (l.zip) dados.zip = l.zip;
      dados.linksExpiram = l.expira;
      return dados;
    }, function(e){ renovando = null; throw e; });
    return renovando;
  }
  setInterval(function(){ if (!document.hidden && linksVencendo(8 * 60000)) renovarLinks().catch(function(){}); }, 60000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && linksVencendo(8 * 60000)) renovarLinks().catch(function(){}); });

  // botões e links do PDF: se o link já venceu, pega um novo antes de abrir
  function abrirPdf(e){
    if (!linksVencendo(60000)) return;
    e.preventDefault();
    renovarLinks().then(function(d){ location.href = d.encarte.pdf; }, function(){});
  }

  window.Correnteza = {
    api: API,
    pedirJson: pedirJson,
    carregar: carregar,
    dados: function(){ return dados; },
    aoCarregar: function(f){ ouvintes.push(f); if (dados) f(dados); },
    usarCodigo: function(codigo){ gravar('correnteza.codigo', codigo); return carregar(); },
    sair: function(){ gravar('correnteza.codigo', null); return carregar(); },
    credenciais: credenciais,
    consulta: consulta,
    linksVencendo: linksVencendo,
    renovarLinks: renovarLinks,
    abrirPdf: abrirPdf,
    evento: function(nome){ if (window.Medicao) window.Medicao.evento(nome); },
    origem: function(){ return window.Medicao ? window.Medicao.origem() : 'direto'; },
    ler: ler,
    gravar: gravar
  };
})();

// ----- 3. Barra de avanço viva -----
// A parte já ouvida é uma correnteza que acende como plâncton bioluminescente: três fios de luz
// ondulando, uma cabeça que pulsa e faíscas que se soltam e ficam para trás.
window.Correnteza.bioluz = function(amplitude){
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = null, ctx = null, w = 0, h = 0, t = 0, faiscas = [];
  var tom = [95, 242, 224];
  var obsTamanho = 'ResizeObserver' in window ? new ResizeObserver(function(){ medir(); }) : null;

  function rgb(hex){
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function cor(c, a){ return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  function medir(){
    if (!canvas) return;
    var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function onda(x, fim, fase, amp){
    // os fios se juntam na cabeça e se abrem ao longo do que já passou
    var abre = Math.min(1, (fim - x) / 70) * Math.min(1, x / 24 + .2);
    return h / 2 + (Math.sin(x * .05 - fase) * .6 + Math.sin(x * .017 + fase * .55) * .4) * amp * abre;
  }

  function quadro(dt, p, tocando){
    if (!ctx || w < 2) return;
    if (reduzir) dt = 0;
    t += dt / 60;
    var fim = Math.max(0, Math.min(1, p || 0)) * w, meio = h / 2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    // o leito do rio, ainda escuro
    ctx.strokeStyle = 'rgba(169,188,203,.16)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1, meio); ctx.lineTo(w - 1, meio); ctx.stroke();
    if (fim < 1) return;

    ctx.globalCompositeOperation = 'lighter';
    [
      { amp: amplitude,       fase: t * 2.1,       c: [30, 95, 210],  a: .45, lw: 4,   brilho: 10 },
      { amp: amplitude * .7,  fase: t * 3 + 1.7,   c: [57, 200, 255], a: .7,  lw: 2,   brilho: 8 },
      { amp: amplitude * .45, fase: t * 1.5 + 3.1, c: tom,            a: .95, lw: 1.4, brilho: 6 }
    ].forEach(function(f){
      var g = ctx.createLinearGradient(0, 0, fim, 0);
      g.addColorStop(0, cor(f.c, f.a * .25));
      g.addColorStop(.7, cor(f.c, f.a * .7));
      g.addColorStop(1, cor(f.c, f.a));
      ctx.strokeStyle = g; ctx.lineWidth = f.lw;
      ctx.shadowColor = cor(f.c, .9); ctx.shadowBlur = f.brilho;
      ctx.beginPath();
      for (var x = 0; x <= fim; x += 3) ctx[x ? 'lineTo' : 'moveTo'](x, onda(x, fim, f.fase, f.amp));
      ctx.lineTo(fim, meio);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // faíscas: nascem na cabeça e ao longo da correnteza, derivam para trás e se apagam
    if (tocando && dt){
      var nascer = dt * (amplitude > 6 ? .9 : .5);
      while (nascer > 0){
        if (Math.random() < nascer){
          var junto = Math.random() < .55;
          var px = junto ? fim - Math.random() * 14 : Math.random() * fim;
          faiscas.push({ x: px, y: onda(px, fim, t * 3 + 1.7, amplitude * .7) + (Math.random() - .5) * amplitude,
            vx: -(.15 + Math.random() * .6), vy: (Math.random() - .5) * .35,
            r: .6 + Math.random() * (amplitude > 6 ? 1.8 : 1.1), vida: 0, max: 30 + Math.random() * 60,
            c: Math.random() < .3 ? tom : Math.random() < .5 ? [150, 255, 240] : [80, 190, 255] });
        }
        nascer -= 1;
      }
    }
    faiscas = faiscas.filter(function(s){
      s.vida += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.vida > s.max || s.x < 0) return false;
      var a = Math.sin(Math.PI * s.vida / s.max);
      ctx.fillStyle = cor(s.c, a * .22);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, 6.29); ctx.fill();
      ctx.fillStyle = cor(s.c, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill();
      return true;
    });

    // a cabeça da correnteza, pulsando
    var pulso = 1 + (tocando ? Math.sin(t * 6) * .18 : 0), raio = (amplitude > 6 ? 11 : 7) * pulso;
    var luz = ctx.createRadialGradient(fim, meio, 0, fim, meio, raio);
    luz.addColorStop(0, 'rgba(235,255,252,.95)');
    luz.addColorStop(.3, cor(tom, .7));
    luz.addColorStop(1, cor(tom, 0));
    ctx.fillStyle = luz;
    ctx.beginPath(); ctx.arc(fim, meio, raio, 0, 6.29); ctx.fill();
  }

  return {
    ligar: function(c){
      if (canvas === c) return;
      if (canvas && obsTamanho) obsTamanho.unobserve(canvas);
      canvas = c; ctx = c ? c.getContext('2d') : null; faiscas = [];
      if (c){ medir(); if (obsTamanho) obsTamanho.observe(c); }
    },
    cor: function(hex){ tom = rgb(hex) || [95, 242, 224]; },
    quadro: quadro
  };
};

// ----- 4. Lista de faixas e player -----
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
  // a cor de cada faixa no encarte (a API manda as definitivas para quem tem o código)
  var TONS = ['#E8C872', '#E39B4F', '#5FC9C4', '#7FC7A4', '#E5774A', '#93A6D6', '#B07AA1', '#4FB8F0', '#C3B2F0'];
  var bioPrincipal = C.bioluz(9);
  var bioMini = C.bioluz(5);
  bioPrincipal.ligar(document.getElementById('bioPrincipal'));
  var completo = false;
  var atual = -1;
  var arrastando = false;
  var pedindoPlay = false; // a pessoa pediu para tocar e o áudio ainda não começou
  var ultimaRenovacao = 0; // evita pedir links novos sem parar se a faixa continuar falhando
  var retomarEm = -1;      // depois de trocar o link, volta ao ponto em que estava
  var desenhos = [];       // outras barras que andam junto com o player (tela da letra, js/letra.js)
  var trocas = [];         // avisados quando a faixa muda
  // quem chega por um link de faixa (correnteza.html?faixa=lugubre) já encontra a faixa escolhida
  var pedida = (new URLSearchParams(location.search).get('faixa') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  function slug(f){ return f.id.replace(/^\d+-/, ''); }

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

  // mini player de cada prévia na lista: ícone de tocar/pausar e uma barrinha que corre com o trecho
  function miniPlayer(){
    var m = el('span', 'mini');
    m.setAttribute('role', 'img');
    m.setAttribute('aria-label', 'prévia');
    m.innerHTML = '<svg class="mini-icone" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11"/>'
      + '<path class="i-tocar" d="M10 7.5l6.5 4.5-6.5 4.5z"/><path class="i-pausa" d="M8.5 7.5h2.5v9H8.5zM13 7.5h2.5v9H13z"/></svg>'
      + '<span class="mini-barra"><canvas></canvas></span>';
    return m;
  }
  function tomDe(f, i){ return (f.cores && /^#[0-9a-f]{6}$/i.test(f.cores.tom)) ? f.cores.tom : TONS[i % TONS.length]; }

  // um só laço de animação desenha a barra do player e a da faixa atual na lista
  var quadro = 0, ultimo = 0;
  function progresso(){
    if (arrastando) return barra.value / 100;
    return audio.duration ? audio.currentTime / audio.duration : 0;
  }
  function pintar(dt){
    var p = progresso(), tocando = !audio.paused;
    bioPrincipal.quadro(dt, p, tocando);
    bioMini.quadro(dt, audio.duration ? audio.currentTime / audio.duration : 0, tocando);
    desenhos.forEach(function(d){ d(dt, tocando); });
  }
  function animar(agora){
    pintar(ultimo ? Math.min(50, agora - ultimo) / 16.7 : 1);
    ultimo = agora;
    quadro = requestAnimationFrame(animar);
  }
  function parar(){ cancelAnimationFrame(quadro); ultimo = 0; pintar(0); }

  var ICONE_COMPARTILHAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/></svg>';
  function montar(d){
    var tocando = !audio.paused;
    var idAtual = atual >= 0 && faixas[atual] ? faixas[atual].id : null;
    var liberou = !completo && !!d.acesso;
    faixas = d.faixas;
    completo = !!d.acesso;
    lista.textContent = '';
    lista.classList.toggle('previas', !completo);
    faixas.forEach(function(f, i){
      var li = el('li', 'disponivel');
      li.style.setProperty('--tom', tomDe(f, i));
      var b = el('button', 'faixa');
      b.type = 'button';
      b.appendChild(el('span', 'num', dois(f.numero)));
      b.appendChild(el('span', 'nome', f.titulo));
      var estado = el('span', 'estado');
      if (!completo) estado.appendChild(miniPlayer());
      b.appendChild(estado);
      b.addEventListener('click', function(){ if (i === atual) alternar(); else carregarFaixa(i, true); });
      li.appendChild(b);
      // letra sincronizada numa tela cheia (js/letra.js); sem o álbum, a tela mostra o convite
      var letra = el('a', 'ver-letra', 'letra'); letra.href = completo ? '#letra-' + f.numero : '#apoie';
      letra.setAttribute('aria-label', 'Letra de ' + f.titulo);
      letra.setAttribute('aria-haspopup', 'dialog');
      letra.addEventListener('click', function(e){
        if (C.abrirLetra && C.abrirLetra(i, letra)) e.preventDefault();
      });
      var extras = el('span', 'faixa-extras');
      extras.appendChild(letra);
      if (completo){
        // download das faixas só quando o backend liberar (DOWNLOAD_FAIXAS = "sim")
        if (f.download){
          var baixar = el('a', 'ver-letra', 'baixar'); baixar.href = f.download; baixar.setAttribute('download', '');
          baixar.setAttribute('aria-label', 'Baixar ' + f.titulo);
          extras.appendChild(baixar);
        }
        // cartão da faixa para os Stories (js/compartilhar.js)
        var partilhar = el('button', 'ver-letra partilhar');
        partilhar.type = 'button';
        partilhar.setAttribute('aria-label', 'Compartilhar ' + f.titulo);
        partilhar.innerHTML = ICONE_COMPARTILHAR;
        partilhar.addEventListener('click', function(){ if (C.compartilhar) C.compartilhar({ modo: 'faixa', faixa: i }); });
        extras.appendChild(partilhar);
        // mostra a duração assim que ela for conhecida
        var sonda = new Audio(); sonda.preload = 'metadata'; sonda.src = f.audio;
        sonda.addEventListener('loadedmetadata', function(){ estado.textContent = formatar(sonda.duration); sonda.removeAttribute('src'); });
      }
      li.appendChild(extras);
      lista.appendChild(li);
    });
    tocador.classList.remove('bloqueado');
    [btTocar, btAnterior, btProxima, barra].forEach(function(b){ b.disabled = false; });
    aviso.textContent = completo
      ? (d.downloadFaixas ? 'Seu álbum completo. Toque numa faixa para ouvir ou baixe as músicas uma a uma.' : 'Seu álbum completo. Toque numa faixa para ouvir.')
      : 'Ouça uma prévia de 15 segundos de cada faixa. O álbum completo fica disponível em primeira mão para quem adquire.';
    sub.textContent = completo ? 'Correnteza' : 'prévias de 15 segundos';

    // ao liberar o acesso, a prévia para e a pessoa escolhe por qual faixa completa começar
    var i = !liberou && idAtual ? faixas.map(function(f){ return f.id; }).indexOf(idAtual) : -1;
    if (i < 0 && pedida) i = faixas.map(slug).indexOf(pedida);
    if (liberou) audio.pause();
    atual = -1;
    carregarFaixa(i >= 0 ? i : 0, tocando && !liberou);
    if (pedida){ pedida = ''; anunciarPedida(); }
  }

  // botão da apresentação: "Ouvir a prévia de Lúgubre" para quem chegou pelo link da faixa
  var btPrevia = document.getElementById('btOuvirPrevia');
  function anunciarPedida(){
    if (btPrevia && faixas[atual] && atual > 0) btPrevia.textContent = 'Ouvir a prévia de ' + faixas[atual].titulo;
  }
  if (btPrevia) btPrevia.addEventListener('click', function(){
    if (!faixas.length) return;
    if (audio.paused) alternar();
    document.getElementById('ouvir').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function carregarFaixa(i, tocarJa){
    var f = faixas[i];
    if (!f) return;
    atual = i;
    itens().forEach(function(x, j){
      x.classList.toggle('atual', j === i);
      var b = x.querySelector('.faixa');
      if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var tela = lista.children[i] && lista.children[i].querySelector('.mini-barra canvas');
    bioMini.ligar(tela || null);
    bioMini.cor(tomDe(f, i)); bioPrincipal.cor(tomDe(f, i));
    tocador.style.setProperty('--tom', tomDe(f, i));
    tocador.classList.remove('avisando');
    titulo.textContent = f.titulo;
    sub.textContent = 'Correnteza · faixa ' + dois(f.numero) + (completo ? '' : ' · prévia');
    barra.value = 0; tempoAtual.textContent = '0:00'; tempoTotal.textContent = '0:00';
    if ('mediaSession' in navigator){
      navigator.mediaSession.metadata = new MediaMetadata({
        title: f.titulo, artist: 'Thales Carvalho & Thayson Azevedo', album: 'Correnteza',
        artwork: [{ src: 'img/sem-ano_capa-album_correnteza.webp', sizes: '1600x1600', type: 'image/webp' }]
      });
    }
    retomarEm = -1;
    // link da faixa completa perto de vencer: pede um novo antes de tocar
    if (completo && C.linksVencendo(2 * 60000)){
      audio.pause(); audio.removeAttribute('src'); audio.load();
      var esta = i;
      C.renovarLinks().catch(function(){}).then(function(){
        if (atual !== esta) return;
        audio.src = faixas[i].audio;
        if (tocarJa) tocar();
      });
    } else {
      audio.src = completo ? f.audio : f.previa;
      if (tocarJa) tocar();
    }
    pintar(0);
    trocas.forEach(function(t){ t(i); });
  }
  function tocar(){
    pedindoPlay = true;
    var p = audio.play();
    if (p && p.catch) p.catch(function(){ pedindoPlay = false; });
  }
  function alternar(){
    if (atual < 0){ carregarFaixa(0, true); return; }
    if (audio.paused){
      if (!audio.getAttribute('src') && faixas[atual]) audio.src = completo ? faixas[atual].audio : faixas[atual].previa;
      tocar();
    } else audio.pause();
  }
  function vizinha(passo){ return faixas.length ? (atual + passo + faixas.length) % faixas.length : -1; }

  btTocar.addEventListener('click', alternar);
  function anterior(){
    if (audio.currentTime > 3){ audio.currentTime = 0; return; }
    carregarFaixa(vizinha(-1), true);
  }
  function proxima(){ carregarFaixa(vizinha(1), true); }
  btAnterior.addEventListener('click', anterior);
  btProxima.addEventListener('click', proxima);

  audio.addEventListener('play', function(){ btTocar.innerHTML = '&#10074;&#10074;'; btTocar.setAttribute('aria-label', 'Pausar'); document.body.classList.add('tocando');
    cancelAnimationFrame(quadro); quadro = requestAnimationFrame(animar);
    tocador.classList.remove('avisando');
    if (completo) pegarVez(); else C.evento('previa');
  });
  audio.addEventListener('playing', function(){ pedindoPlay = false; });
  audio.addEventListener('pause', function(){ btTocar.innerHTML = '&#9654;&#xFE0E;'; btTocar.setAttribute('aria-label', 'Tocar'); document.body.classList.remove('tocando');
    parar();
  });
  audio.addEventListener('loadedmetadata', function(){
    tempoTotal.textContent = formatar(audio.duration);
    if (retomarEm > 0){ audio.currentTime = retomarEm; retomarEm = -1; }
  });
  audio.addEventListener('timeupdate', function(){
    if (completo && !audio.paused) conferirVez();
    if (arrastando || !audio.duration) return;
    barra.value = (audio.currentTime / audio.duration) * 100;
    tempoAtual.textContent = formatar(audio.currentTime);
    if (audio.paused) pintar(0); // ao arrastar a barra principal com o áudio parado
  });
  audio.addEventListener('ended', function(){
    // a primeira prévia ouvida até o fim abre o cartão "comprar / me avise" em vez de seguir
    if (!completo){
      C.evento('previa_fim');
      if (C.fimDaPrevia && C.fimDaPrevia(faixas[atual], function(){ carregarFaixa(vizinha(1), true); })) return;
    }
    if (atual < faixas.length - 1) carregarFaixa(atual + 1, true); // para ao fim da última faixa
  });
  audio.addEventListener('error', function(){
    var src = audio.getAttribute('src');
    if (!src) return;
    // link da faixa completa vencido (aparelho dormiu, pausa longa): pega um novo e continua de onde parou
    if (completo && Date.now() - ultimaRenovacao > 60000){
      ultimaRenovacao = Date.now();
      var esta = atual, ponto = audio.currentTime || 0, retomar = pedindoPlay || !audio.paused;
      C.renovarLinks().then(function(){
        if (atual !== esta || !faixas[esta]) return;
        retomarEm = ponto;
        audio.src = faixas[esta].audio;
        if (retomar) tocar();
      }, function(){
        sub.textContent = 'Não deu para tocar esta faixa agora. Tente de novo em instantes.';
      });
      return;
    }
    pedindoPlay = false;
    sub.textContent = completo ? 'Não deu para tocar esta faixa agora. Tente de novo em instantes.' : 'Prévia indisponível no momento.';
  });

  // ----- Uma reprodução por vez -----
  // Ao dar play, este aparelho pega a vez. Enquanto toca, confere a cada 20 s se outro aparelho
  // com o mesmo código começou a tocar; se sim, pausa aqui com um aviso.
  var ultimaConferencia = 0;
  function pegarVez(){
    ultimaConferencia = Date.now();
    C.pedirJson('/api/tocando', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C.credenciais())
    }).catch(function(){});
  }
  function conferirVez(){
    if (Date.now() - ultimaConferencia < 20000) return;
    ultimaConferencia = Date.now();
    C.pedirJson('/api/tocando' + C.consulta(), { cache: 'no-store' }).then(function(r){
      if (r.meu === false){
        audio.pause();
        sub.textContent = 'Pausado: começou a tocar em outro aparelho (' + (r.outro || 'sem nome') + ').';
        tocador.classList.add('avisando');
      } else if (r._status === 401 || r._status === 403){
        audio.pause();
        C.carregar();
      }
    }, function(){});
  }
  barra.addEventListener('input', function(){
    arrastando = true;
    if (audio.duration) tempoAtual.textContent = formatar(barra.value / 100 * audio.duration);
    if (audio.paused) pintar(0);
  });
  barra.addEventListener('change', function(){
    if (audio.duration) audio.currentTime = barra.value / 100 * audio.duration;
    arrastando = false;
  });
  if ('mediaSession' in navigator){
    navigator.mediaSession.setActionHandler('play', function(){ audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function(){ audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', anterior);
    navigator.mediaSession.setActionHandler('nexttrack', proxima);
  }

  // o que a tela da letra (js/letra.js) usa do player: o mesmo <audio>, os mesmos botões e o mesmo laço de desenho
  C.player = {
    audio: audio,
    faixas: function(){ return faixas; },
    atual: function(){ return atual; },
    completo: function(){ return completo; },
    tom: function(i){ return faixas[i] ? tomDe(faixas[i], i) : TONS[0]; },
    formatar: formatar,
    // abre a faixa i tocando; se já é a atual e está parada, continua de onde parou
    tocarFaixa: function(i){ if (i !== atual) carregarFaixa(i, true); else if (audio.paused) alternar(); },
    // só escolhe a faixa (continua tocando se já estava)
    escolher: function(i){ if (i !== atual) carregarFaixa(i, !audio.paused); },
    alternar: alternar,
    anterior: anterior,
    proxima: proxima,
    aoTrocar: function(f){ trocas.push(f); },
    desenhar: function(f){ desenhos.push(f); },
    pintar: function(){ pintar(0); }
  };

  C.aoCarregar(montar);
  C.evento('visita');
  C.pronto = C.carregar();
  C.pronto.catch(function(){
    aviso.textContent = 'Não foi possível carregar as prévias agora. Tente recarregar a página em instantes.';
  });
})();

// ----- 5. Encarte: com o código, as páginas com as letras surgem ao rolar e a névoa se move em camadas -----
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
    var intro = el('p', 'encarte-intro', 'Letras e créditos de cada faixa de Correnteza. ');
    if (d.encarte && d.encarte.pdf){
      var pdf = el('a', '', 'Baixar o encarte em PDF'); pdf.href = d.encarte.pdf; pdf.setAttribute('download', '');
      pdf.addEventListener('click', function(e){ pdf.href = C.dados().encarte.pdf; C.abrirPdf(e); });
      intro.appendChild(pdf);
    }
    dentro.appendChild(intro);
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

// ----- 6. Fim da prévia: cartão discreto com "ouvir o álbum completo" ou "me avise das novidades" -----
// Aparece uma vez por visita, quando a primeira prévia termina. As outras prévias seguem sozinhas.
(function(){
  var C = window.Correnteza;
  var cartao = document.getElementById('fimPrevia');
  if (!cartao) return;
  var form = document.getElementById('formNovidades');
  var campo = document.getElementById('emailNovidades');
  var aceite = document.getElementById('aceiteNovidades');
  var msg = document.getElementById('msgNovidades');
  var ok = document.getElementById('novidadesOk');
  var mostrado = false, seguir = null;

  function fechar(){ cartao.classList.remove('aberto'); cartao.hidden = true; }
  function avisar(t){ msg.textContent = t || ''; msg.hidden = !t; }

  C.fimDaPrevia = function(f, proxima){
    if (mostrado || document.body.classList.contains('com-acesso')) return false;
    mostrado = true; seguir = proxima;
    cartao.querySelector('[data-faixa]').textContent = f.titulo;
    cartao.hidden = false;
    requestAnimationFrame(function(){ cartao.classList.add('aberto'); });
    return true;
  };

  document.getElementById('fimPreviaFechar').addEventListener('click', fechar);
  document.getElementById('btProximaPrevia').addEventListener('click', function(){ fechar(); if (seguir) seguir(); });
  [].forEach.call(cartao.querySelectorAll('[data-comprar]'), function(a){ a.addEventListener('click', fechar); });
  document.getElementById('btMeAvise').addEventListener('click', function(){
    form.hidden = false; this.hidden = true;
    campo.focus();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !cartao.hidden) fechar(); });
  C.aoCarregar(function(d){ if (d.acesso) fechar(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var email = campo.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ avisar('Informe um e-mail válido.'); campo.focus(); return; }
    if (!aceite.checked){ avisar('Marque a caixa para confirmar que quer receber as novidades.'); return; }
    avisar('');
    var botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    C.pedirJson('/api/novidades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, aceite: true, origem: 'previa' })
    }).then(function(r){
      botao.disabled = false;
      if (!r.ok){ avisar(r.mensagem || 'Não foi possível guardar seu e-mail agora. Tente de novo.'); return; }
      form.hidden = true; ok.hidden = false;
      C.evento('novidades');
    }, function(){
      botao.disabled = false;
      avisar('Sem conexão agora. Verifique a internet e tente de novo.');
    });
  });
})();
