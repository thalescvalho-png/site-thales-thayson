// Música sem pausa pelo site: com uma faixa em andamento, os links para as outras páginas
// (início, termos, links…) abrem numa camada por cima da página do álbum, em vez de trocar de página.
// A página do álbum continua viva por baixo, com o mesmo <audio>, e o player fixo fica à vista
// sobre a camada. Os links de volta para o álbum só fecham a camada.
(function(){
  var C = window.Correnteza;
  var P = C && C.player;
  if (!P || !window.history || !history.pushState) return;
  var audio = P.audio;
  var tocador = document.getElementById('tocador');
  var camada = null, quadro = null, aberta = false, tituloAlbum = document.title;

  function emAndamento(){ return !audio.paused || audio.currentTime > 0; }

  // só páginas deste site, abertas na mesma aba; a própria página do álbum fica de fora
  function doSite(a){
    if (!a || !a.href || a.hasAttribute('download')) return null;
    if (a.target && a.target !== '_self') return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    return u;
  }
  function ehAlbum(u){ return /\/correnteza\.html$/.test(u.pathname) || /\/correnteza\/?$/.test(u.pathname); }
  function ehAdmin(u){ return /\/admin\.html$/.test(u.pathname); }

  function criar(){
    camada = document.createElement('div');
    camada.className = 'camada-site';
    camada.hidden = true;
    quadro = document.createElement('iframe');
    quadro.title = 'Site de Thales Carvalho e Thayson Azevedo';
    quadro.addEventListener('load', aoCarregar);
    camada.appendChild(quadro);
    document.body.appendChild(camada);
    // a camada termina onde começa o player, que fica à vista por cima
    var medir = function(){ camada.style.bottom = (tocador.classList.contains('bloqueado') ? 0 : tocador.offsetHeight) + 'px'; };
    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(tocador);
    window.addEventListener('resize', medir);
    medir();
  }

  function abrir(url, empurrar){
    if (!camada) criar();
    if (url && (!quadro.getAttribute('src') || quadro.contentWindow.location.href !== url)) quadro.src = url;
    aberta = true;
    camada.hidden = false;
    document.documentElement.classList.add('camada-aberta');
    if (empurrar) history.pushState({ camadaSite: true }, '', url || quadro.contentWindow.location.href);
    try { if (quadro.contentDocument.title) document.title = quadro.contentDocument.title; } catch (e) {}
    quadro.focus();
  }

  function fechar(hash){
    if (!aberta) return;
    aberta = false;
    camada.hidden = true;
    document.documentElement.classList.remove('camada-aberta');
    document.title = tituloAlbum;
    if (hash && document.getElementById(hash.slice(1))) location.hash = hash;
  }

  // cada página aberta na camada: título e endereço na barra do navegador, e os links tratados aqui
  function aoCarregar(){
    var doc;
    try { doc = quadro.contentDocument; } catch (e) { return; }
    if (!doc || !aberta) return;
    if (doc.title) document.title = doc.title;
    try { history.replaceState({ camadaSite: true }, '', quadro.contentWindow.location.href); } catch (e) {}
    doc.addEventListener('click', function(e){
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var u = doSite(a);
      if (u && ehAlbum(u)){
        // de volta ao álbum: só fecha a camada (e vai à seção pedida, se houver)
        e.preventDefault();
        history.pushState(null, '', 'correnteza.html' + u.hash);
        fechar(u.hash);
      } else if (!u && !(a.target && a.target !== '_self') && !/^(mailto|tel):/.test(a.href)){
        // fora do site na mesma aba: sai da camada e segue como um link comum
        e.preventDefault();
        location.href = a.href;
      }
    });
  }

  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    var u = doSite(a);
    if (!u || ehAlbum(u) || ehAdmin(u) || !emAndamento()) return;
    e.preventDefault();
    abrir(u.href, true);
  });

  // voltar e avançar do navegador abrem e fecham a camada
  window.addEventListener('popstate', function(e){
    if (e.state && e.state.camadaSite){ if (camada && quadro.getAttribute('src')) abrir(null, false); }
    else fechar();
  });
})();
