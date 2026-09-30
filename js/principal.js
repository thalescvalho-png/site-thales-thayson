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
  }
  function pedir(){ if (!pendente){ pendente = true; requestAnimationFrame(atualizar); } }

  passos.forEach(function(el){ el.classList.add('on'); });
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
