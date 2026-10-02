// Rolagem dos links do menu (#secao): em vez do salto seco, a página desliza com aceleração suave
// e o título da seção chega subindo. Quem pede menos movimento no sistema continua com o salto direto.
(function(){
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');
  var animando = 0;

  function suavizar(t){ return t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }
  function folgaDoTopo(){
    var topo = document.getElementById('topo');
    return topo ? topo.getBoundingClientRect().height : 0;
  }

  function chegar(alvo){
    var titulo = alvo.querySelector('h2') || alvo;
    titulo.classList.remove('chegando');
    void titulo.offsetWidth; // reinicia a animação se a pessoa clicar de novo
    titulo.classList.add('chegando');
    titulo.addEventListener('animationend', function(){ titulo.classList.remove('chegando'); }, { once: true });
    if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  }

  function deslizar(alvo){
    var inicio = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var fim = Math.min(max, Math.max(0, alvo.getBoundingClientRect().top + inicio - folgaDoTopo()));
    var distancia = fim - inicio;
    var duracao = Math.min(1400, 550 + Math.abs(distancia) * 0.18);
    var comeco = null, esta = ++animando;
    // tocar ou girar a roda no meio do caminho devolve o controle à pessoa
    function parar(){ animando++; tirar(); }
    function tirar(){ ['wheel', 'touchstart', 'keydown'].forEach(function(t){ window.removeEventListener(t, parar); }); }
    ['wheel', 'touchstart', 'keydown'].forEach(function(t){ window.addEventListener(t, parar, { passive: true }); });
    function passo(agora){
      if (esta !== animando) return;
      if (comeco === null) comeco = agora;
      var t = Math.min(1, (agora - comeco) / duracao);
      window.scrollTo(0, inicio + distancia * suavizar(t));
      if (t < 1) requestAnimationFrame(passo);
      else { tirar(); chegar(alvo); }
    }
    requestAnimationFrame(passo);
  }

  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link || link.closest('dialog') || /^#letra-/.test(link.getAttribute('href'))) return;
    var id = decodeURIComponent(link.getAttribute('href').slice(1));
    var alvo = id && document.getElementById(id);
    if (!alvo || reduzir.matches) return;
    e.preventDefault();
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    deslizar(alvo);
  });
})();
