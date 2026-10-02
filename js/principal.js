(function(){
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var topo = document.getElementById('topo');
  var camadas = [].slice.call(document.querySelectorAll('.camada'));
  var aberturaTexto = document.getElementById('aberturaTexto');
  var correnteza = document.getElementById('correnteza');
  var passos = [].slice.call(document.querySelectorAll('.passo'));
  var capaArte = document.getElementById('capaArte');
  var capaVeu = document.getElementById('capaVeu');
  var trajetoria = document.getElementById('trajetoria');
  var trilha = document.getElementById('trilha');
  var rioCheio = document.getElementById('rioCheio');
  var pendente = false;

  function limitar(v){ return Math.max(0, Math.min(1, v)); }
  function progresso(secao){
    var r = secao.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    return total > 0 ? limitar(-r.top / total) : 0;
  }
  function medirTrajetoria(){
    if (reduzir) return;
    var sobra = trilha.scrollWidth - window.innerWidth;
    trajetoria.style.height = (window.innerHeight + Math.max(sobra, 0) * 1.1) + 'px';
  }
  function atualizar(){
    pendente = false;
    var y = window.scrollY || window.pageYOffset;
    topo.classList.toggle('solido', y > 40);
    if (reduzir) return;

    // 1. Parallax da abertura: cada camada anda numa velocidade
    var alturaAbertura = window.innerHeight;
    if (y < alturaAbertura * 1.2){
      camadas.forEach(function(c){ c.style.transform = 'translate3d(0,' + (y * parseFloat(c.dataset.velocidade)) + 'px,0)'; });
    }

    // 2. Correnteza: sem efeito de névoa; a seção rola normalmente
    // 3. Trajetória: rolar para baixo faz a linha do tempo andar para o lado
    var t = progresso(trajetoria);
    var sobra = Math.max(trilha.scrollWidth - window.innerWidth, 0);
    trilha.style.transform = 'translate3d(' + (-t * sobra) + 'px,0,0)';
    rioCheio.style.width = (t * 100) + '%';

    deslizar();
  }
  function pedir(){ if (!pendente){ pendente = true; requestAnimationFrame(atualizar); } }

  // 5. Movimento ao rolar: os títulos se compõem palavra por palavra, textos e cartões
  //    sobem da névoa um depois do outro, as fotos se abrem e andam num ritmo diferente do texto
  var deslizantes = [];
  function compor(){
    if (reduzir || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('mov');

    // títulos: cada palavra vira um pedaço que sobe sozinho
    [].forEach.call(document.querySelectorAll('.correnteza h2, .quem h2, .traj-topo h2, .disco h2, .galeria h2, .contato h2'), function(h){
      var palavras = h.textContent.trim().split(/\s+/);
      h.setAttribute('aria-label', h.textContent.trim());
      h.textContent = '';
      palavras.forEach(function(p, i){
        var s = document.createElement('span');
        s.className = 'pal'; s.setAttribute('aria-hidden', 'true');
        s.style.setProperty('--w', i);
        s.textContent = p;
        h.appendChild(s);
        if (i < palavras.length - 1) h.appendChild(document.createTextNode(' '));
      });
      h.classList.add('palavras');
    });

    // grupos que entram em sequência: o --i de cada item dá o atraso
    function grupo(seletor, base){
      [].forEach.call(document.querySelectorAll(seletor), function(el, i){
        el.classList.add('revela');
        el.style.setProperty('--i', (base || 0) + i);
      });
    }
    grupo('.correnteza .quando');
    grupo('.correnteza .verso, .correnteza .descricao, .correnteza .acoes-linha', 2);
    grupo('.quem p, .quem .mais', 2);
    grupo('.traj-topo .botao', 2);
    grupo('.galeria .intro', 1);
    grupo('.contato .apoio-texto', 1);
    grupo('.contato dl > div', 2);
    [].forEach.call(document.querySelectorAll('.obra'), function(el, i){ el.classList.add('revela'); el.style.setProperty('--i', i % 4); });
    [].forEach.call(document.querySelectorAll('.mosaico figure'), function(el, i){ el.classList.add('revela'); el.style.setProperty('--i', i % 3); });
    [].forEach.call(document.querySelectorAll('.marco'), function(el){ el.classList.add('revela', 'lado'); });
    [].forEach.call(document.querySelectorAll('.capa, .retrato'), function(el){ el.classList.add('desvela'); });

    var olho = new IntersectionObserver(function(entradas){
      entradas.forEach(function(e){
        if (!e.isIntersecting) return;
        e.target.classList.add('visto');
        olho.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    [].forEach.call(document.querySelectorAll('.palavras, .revela, .desvela'), function(el){ olho.observe(el); });

    // foto e texto em velocidades diferentes (parallax suave)
    deslizantes = [
      { el: document.querySelector('.capa'), v: -0.07 },
      { el: document.querySelector('.retrato'), v: -0.09 },
      { el: document.querySelector('.quem h2'), v: 0.04 }
    ].filter(function(d){ return d.el; });
  }
  function deslizar(){
    var meio = window.innerHeight / 2;
    deslizantes.forEach(function(d){
      var r = d.el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
      d.el.style.setProperty('--py', ((r.top + r.height / 2 - meio) * d.v).toFixed(1) + 'px');
    });
    // a abertura sobe e se apaga devagar enquanto a página rola
    if (aberturaTexto){
      var y = window.scrollY || window.pageYOffset, h = window.innerHeight;
      if (y < h * 1.2){
        aberturaTexto.style.transform = 'translate3d(0,' + (y * -0.18).toFixed(1) + 'px,0)';
        aberturaTexto.style.opacity = Math.max(0, 1 - y / (h * 0.75)).toFixed(3);
      }
    }
  }

  passos.forEach(function(el){ el.classList.add('on'); });
  compor();
  medirTrajetoria();
  atualizar();
  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', function(){ medirTrajetoria(); pedir(); });
  if (document.fonts && document.fonts.ready){ document.fonts.ready.then(function(){ medirTrajetoria(); pedir(); }); }

  // 4. Galeria: clicar numa foto abre a versão ampliada, com setas e Esc
  var janela = document.getElementById('ampliada');
  var fotos = [].slice.call(document.querySelectorAll('.mosaico figure'));
  if (!janela || !janela.showModal || !fotos.length) return;
  var grande = janela.querySelector('img');
  var legenda = janela.querySelector('p');
  var atual = 0;

  function mostrar(i){
    atual = (i + fotos.length) % fotos.length;
    var img = fotos[atual].querySelector('img');
    grande.src = img.currentSrc || img.src;
    grande.alt = img.alt;
    legenda.textContent = fotos[atual].querySelector('figcaption').textContent;
  }
  fotos.forEach(function(fig, i){
    fig.querySelector('button').addEventListener('click', function(){ mostrar(i); janela.showModal(); });
  });
  janela.querySelector('.fechar').addEventListener('click', function(){ janela.close(); });
  janela.querySelector('.anterior').addEventListener('click', function(){ mostrar(atual - 1); });
  janela.querySelector('.proxima').addEventListener('click', function(){ mostrar(atual + 1); });
  janela.addEventListener('click', function(e){ if (e.target === janela) janela.close(); });
  janela.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft') mostrar(atual - 1);
    if (e.key === 'ArrowRight') mostrar(atual + 1);
  });
  janela.addEventListener('close', function(){ fotos[atual].querySelector('button').focus(); });
})();
