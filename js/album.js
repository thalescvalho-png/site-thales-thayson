(function(){
  var audio = document.getElementById('audio');
  var itens = [].slice.call(document.querySelectorAll('#faixas li'));
  var btTocar = document.getElementById('btTocar');
  var btAnterior = document.getElementById('btAnterior');
  var btProxima = document.getElementById('btProxima');
  var barra = document.getElementById('barra');
  var tempoAtual = document.getElementById('tempoAtual');
  var tempoTotal = document.getElementById('tempoTotal');
  var titulo = document.getElementById('tocadorTitulo');
  var sub = document.getElementById('tocadorSub');
  var aviso = document.getElementById('avisoPlayer');
  var atual = -1;
  var arrastando = false;

  function nome(li){ return li.querySelector('.nome').textContent; }
  function formatar(s){
    if (!isFinite(s)) return '0:00';
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function disponiveis(){ return itens.filter(function(li){ return li.dataset.ok === '1'; }); }

  // 1. Descobre quais arquivos de áudio já existem na pasta audio/
  function verificar(li){
    var src = li.dataset.audio;
    if (!src) return Promise.resolve();
    return fetch(src, { method: 'HEAD' }).then(function(r){
      if (!r.ok) return;
      li.dataset.ok = '1';
      li.classList.add('disponivel');
      li.querySelector('.faixa').disabled = false;
      li.querySelector('.estado').textContent = '';
      // mostra a duração da faixa assim que ela for conhecida
      var sonda = new Audio();
      sonda.preload = 'metadata';
      sonda.src = src;
      sonda.addEventListener('loadedmetadata', function(){ li.querySelector('.estado').textContent = formatar(sonda.duration); });
    }).catch(function(){});
  }

  // 2. Seleciona e toca uma faixa
  function carregar(i, tocarJa){
    var li = itens[i];
    if (!li || li.dataset.ok !== '1') return;
    atual = i;
    itens.forEach(function(x, j){
      x.classList.toggle('atual', j === i);
      var b = x.querySelector('.faixa');
      if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    audio.src = li.dataset.audio;
    titulo.textContent = nome(li);
    sub.textContent = 'Correnteza · faixa ' + li.querySelector('.num').textContent;
    barra.value = 0; tempoAtual.textContent = '0:00';
    if ('mediaSession' in navigator){
      navigator.mediaSession.metadata = new MediaMetadata({
        title: nome(li), artist: 'Thales Carvalho & Thayson Azevedo', album: 'Correnteza',
        artwork: [{ src: 'img/sem-ano_capa-album_correnteza.webp', sizes: '1600x1600', type: 'image/webp' }]
      });
    }
    if (tocarJa) audio.play();
  }
  function vizinha(passo){
    for (var k = 1; k <= itens.length; k++){
      var j = (atual + passo * k + itens.length) % itens.length;
      if (itens[j].dataset.ok === '1') return j;
    }
    return -1;
  }
  function alternar(){
    if (atual < 0){ var p = vizinha(1); if (p >= 0) carregar(p, true); return; }
    if (audio.paused) audio.play(); else audio.pause();
  }

  itens.forEach(function(li, i){
    li.querySelector('.faixa').addEventListener('click', function(){
      if (i === atual) alternar(); else carregar(i, true);
    });
  });
  btTocar.addEventListener('click', alternar);
  btAnterior.addEventListener('click', function(){
    if (audio.currentTime > 3){ audio.currentTime = 0; return; }
    var j = vizinha(-1); if (j >= 0) carregar(j, true);
  });
  btProxima.addEventListener('click', function(){ var j = vizinha(1); if (j >= 0) carregar(j, true); });

  audio.addEventListener('play', function(){ btTocar.innerHTML = '&#10074;&#10074;'; btTocar.setAttribute('aria-label', 'Pausar'); document.body.classList.add('tocando'); });
  audio.addEventListener('pause', function(){ btTocar.innerHTML = '&#9654;&#xFE0E;'; btTocar.setAttribute('aria-label', 'Tocar'); document.body.classList.remove('tocando'); });
  audio.addEventListener('loadedmetadata', function(){ tempoTotal.textContent = formatar(audio.duration); });
  audio.addEventListener('timeupdate', function(){
    if (arrastando || !audio.duration) return;
    barra.value = (audio.currentTime / audio.duration) * 100;
    tempoAtual.textContent = formatar(audio.currentTime);
  });
  audio.addEventListener('ended', function(){
    var j = vizinha(1);
    if (j > atual) carregar(j, true); // para ao fim da última faixa
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
    navigator.mediaSession.setActionHandler('previoustrack', function(){ btAnterior.click(); });
    navigator.mediaSession.setActionHandler('nexttrack', function(){ btProxima.click(); });
  }

  // 3. Liga o player só se houver pelo menos uma faixa disponível
  Promise.all(itens.map(verificar)).then(function(){
    var lista = disponiveis();
    if (!lista.length) return;
    [btTocar, btAnterior, btProxima, barra].forEach(function(b){ b.disabled = false; });
    aviso.textContent = lista.length === itens.length ? 'Toque numa faixa para ouvir.' : 'Algumas faixas já podem ser ouvidas; as outras chegam com o lançamento.';
    carregar(itens.indexOf(lista[0]), false);
  });
})();

// 4. Encarte vivo: as páginas surgem ao rolar e a névoa se move em camadas
(function(){
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var paginas = [].slice.call(document.querySelectorAll('.pagina'));
  paginas.forEach(function(pg){
    [].slice.call(pg.querySelectorAll('.letra p')).forEach(function(p, i){ p.style.setProperty('--i', i); });
  });
  if (reduzir || !('IntersectionObserver' in window)){
    paginas.forEach(function(pg){ pg.classList.add('visivel'); });
    return;
  }
  var obs = new IntersectionObserver(function(entradas){
    entradas.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('visivel'); obs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  paginas.forEach(function(pg){ obs.observe(pg); });
  // quem chega por um link #letra-n vê a página já aberta
  if (location.hash){ var alvo = document.querySelector(location.hash); if (alvo && alvo.classList.contains('pagina')) alvo.classList.add('visivel'); }
  window.addEventListener('hashchange', function(){ var a = document.querySelector(location.hash); if (a) a.classList.add('visivel'); });

  var encarte = document.getElementById('encarte');
  var camadas = [].slice.call(document.querySelectorAll('.camada-e'));
  var pendente = false;
  function mover(){
    pendente = false;
    var r = encarte.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    var d = window.innerHeight - r.top;
    camadas.forEach(function(c){ c.style.transform = 'translate3d(0,' + (d * parseFloat(c.dataset.velocidade)).toFixed(1) + 'px,0)'; });
  }
  window.addEventListener('scroll', function(){ if (!pendente){ pendente = true; requestAnimationFrame(mover); } }, { passive: true });
  mover();
})();
