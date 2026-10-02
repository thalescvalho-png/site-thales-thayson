// Cartões para os Stories (1080×1920), desenhados no próprio navegador com a capa e a paleta do álbum.
//   album:  a capa, o nome do álbum e da dupla (qualquer pessoa)
//   faixa:  a capa, o nome da faixa e da dupla (qualquer pessoa)
//   apoiei: "Apoiei Correnteza", com o selo de apoiador (só quem comprou)
// O celular abre o menu de compartilhar com a imagem pronta. O site não consegue pôr o link no Stories,
// então ele já fica copiado para colar no adesivo de link. Sem esse menu (computador), a imagem é baixada.
(function(){
  var C = window.Correnteza;
  var L = 1080, A = 1920;
  var CAPA = 'img/sem-ano_capa-album_correnteza.webp';
  var SERIF = '"Cormorant Garamond", Georgia, serif';
  var SANS = '"Work Sans", "Helvetica Neue", Arial, sans-serif';
  var capa = null, janela = null, estado = { modo: 'album', faixa: 0 }, arquivo = null, urlImagem = '';
  var geracao = 0;

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function dados(){ return C.dados() || { faixas: [] }; }
  function comprou(){ return !!dados().acesso; }
  function slug(f){ return f.id.replace(/^\d+-/, ''); }

  // ----- Link que vai junto (fica copiado) -----
  function linkDoCartao(){
    var f = dados().faixas[estado.faixa];
    var destino = estado.modo === 'faixa' && f ? slug(f) + '/' : 'correnteza.html';
    var u = new URL(destino, location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('utm_source', 'instagram');
    u.searchParams.set('utm_medium', 'stories');
    u.searchParams.set('utm_content', estado.modo);
    return u.toString();
  }

  // ----- Desenho -----
  function carregarCapa(){
    if (capa) return Promise.resolve(capa);
    return new Promise(function(ok, falha){
      var img = new Image();
      img.onload = function(){ capa = img; ok(img); };
      img.onerror = falha;
      img.src = CAPA;
    });
  }
  function fontes(){
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('500 100px "Cormorant Garamond"'),
      document.fonts.load('italic 500 100px "Cormorant Garamond"'),
      document.fonts.load('600 30px "Work Sans"'),
      document.fonts.load('400 30px "Work Sans"')
    ]).catch(function(){});
  }

  function espacado(ctx, texto, x, y, espaco){
    // letras afastadas (canvas ainda não tem letter-spacing em todo navegador)
    var total = 0, i;
    for (i = 0; i < texto.length; i++) total += ctx.measureText(texto[i]).width + (i ? espaco : 0);
    var cx = x - total / 2;
    ctx.textAlign = 'left';
    for (i = 0; i < texto.length; i++){ ctx.fillText(texto[i], cx, y); cx += ctx.measureText(texto[i]).width + espaco; }
    ctx.textAlign = 'center';
  }

  function fundo(ctx, tom){
    var g = ctx.createLinearGradient(0, 0, 0, A);
    g.addColorStop(0, '#0E1826'); g.addColorStop(.55, '#13223A'); g.addColorStop(1, '#0B1420');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, A);
    // névoa
    [[200, 260, 520, '169,188,203', .10], [900, 1500, 600, '62,92,118', .35], [540, 1780, 700, '169,188,203', .08]].forEach(function(n){
      var r = ctx.createRadialGradient(n[0], n[1], 0, n[0], n[1], n[2]);
      r.addColorStop(0, 'rgba(' + n[3] + ',' + n[4] + ')'); r.addColorStop(1, 'rgba(' + n[3] + ',0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, L, A);
    });
    // o rio âmbar descendo pela página
    ctx.save();
    ctx.strokeStyle = tom || '#C68B3E'; ctx.globalAlpha = .55; ctx.lineWidth = 3;
    ctx.shadowColor = tom || '#C68B3E'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(540, 0);
    ctx.bezierCurveTo(260, 300, 860, 520, 600, 860);
    ctx.bezierCurveTo(380, 1160, 920, 1380, 640, 1640);
    ctx.bezierCurveTo(480, 1790, 560, 1880, 540, A);
    ctx.stroke();
    ctx.restore();
  }

  function capaArredondada(ctx, x, y, t, raio){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, t, t, raio); else ctx.rect(x, y, t, t);
    ctx.fillStyle = '#0E1826'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.drawImage(capa, x, y, t, t);
    ctx.restore();
  }

  function selo(ctx, x, y){
    ctx.save();
    ctx.shadowColor = 'rgba(198,139,62,.8)'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(x, y, 118, 0, 6.29); ctx.fillStyle = '#C68B3E'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 102, 0, 6.29); ctx.strokeStyle = 'rgba(14,24,38,.55)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#0E1826'; ctx.textAlign = 'center';
    ctx.font = '600 24px ' + SANS; espacado(ctx, 'APOIADOR', x, y - 14, 5);
    ctx.font = 'italic 500 42px ' + SERIF; ctx.fillText('Correnteza', x, y + 32);
    ctx.restore();
  }

  function rodape(ctx){
    ctx.fillStyle = 'rgba(231,236,238,.92)'; ctx.textAlign = 'center';
    ctx.font = '500 40px ' + SERIF; ctx.fillText('Thales Carvalho & Thayson Azevedo', L / 2, 1640);
  }

  function desenhar(){
    var canvas = document.createElement('canvas');
    canvas.width = L; canvas.height = A;
    var ctx = canvas.getContext('2d');
    var d = dados(), f = d.faixas[estado.faixa] || { titulo: 'Correnteza', numero: 1 };
    var tom = estado.modo === 'faixa' && f.cores && /^#[0-9a-f]{6}$/i.test(f.cores.tom) ? f.cores.tom : '#C68B3E';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    fundo(ctx, tom);
    capaArredondada(ctx, 170, 300, 740, 28);
    if (estado.modo === 'apoiei'){
      selo(ctx, 860, 1000);
      ctx.fillStyle = '#C68B3E'; ctx.font = '600 30px ' + SANS; espacado(ctx, 'EU APOIEI', L / 2, 1230, 8);
      ctx.fillStyle = '#E7ECEE'; ctx.font = '500 150px ' + SERIF; ctx.fillText('Correnteza', L / 2, 1380);
      ctx.fillStyle = '#B9C8D3'; ctx.font = 'italic 400 46px ' + SERIF; ctx.fillText('o primeiro álbum da dupla, em primeira mão', L / 2, 1460);
    } else if (estado.modo === 'faixa'){
      ctx.fillStyle = tom; ctx.font = '600 30px ' + SANS; espacado(ctx, 'FAIXA ' + (f.numero < 10 ? '0' : '') + f.numero, L / 2, 1210, 8);
      ctx.fillStyle = '#E7ECEE';
      var t = 140; ctx.font = '500 ' + t + 'px ' + SERIF;
      while (ctx.measureText(f.titulo).width > 920 && t > 70){ t -= 6; ctx.font = '500 ' + t + 'px ' + SERIF; }
      ctx.fillText(f.titulo, L / 2, 1350);
      ctx.fillStyle = '#B9C8D3'; ctx.font = 'italic 400 46px ' + SERIF; ctx.fillText('do álbum Correnteza', L / 2, 1430);
    } else {
      ctx.fillStyle = '#C68B3E'; ctx.font = '600 30px ' + SANS; espacado(ctx, 'ÁLBUM', L / 2, 1230, 8);
      ctx.fillStyle = '#E7ECEE'; ctx.font = '500 150px ' + SERIF; ctx.fillText('Correnteza', L / 2, 1390);
    }
    rodape(ctx);
    return canvas;
  }

  function gerar(){
    var esta = ++geracao;
    var previa = janela.querySelector('.cartao-previa');
    previa.classList.add('gerando');
    janela.querySelector('.cartao-nota').textContent = 'Montando a imagem…';
    arquivo = null;
    janela.querySelector('[data-acao=compartilhar]').disabled = true;
    return Promise.all([carregarCapa(), fontes()]).then(function(){
      var canvas = desenhar();
      return new Promise(function(ok){ canvas.toBlob(ok, 'image/png'); });
    }).then(function(blob){
      if (esta !== geracao || !blob) return;
      var f = dados().faixas[estado.faixa];
      var nome = 'correnteza-' + (estado.modo === 'faixa' && f ? slug(f) : estado.modo) + '.png';
      arquivo = new File([blob], nome, { type: 'image/png' });
      if (urlImagem) URL.revokeObjectURL(urlImagem);
      urlImagem = URL.createObjectURL(blob);
      previa.querySelector('img').src = urlImagem;
      previa.classList.remove('gerando');
      janela.querySelector('.cartao-nota').textContent = 'O link fica copiado: no Instagram, cole no adesivo de link.';
      janela.querySelector('[data-acao=compartilhar]').disabled = false;
    }, function(){
      previa.classList.remove('gerando');
      janela.querySelector('.cartao-nota').textContent = 'Não foi possível montar a imagem neste navegador.';
    });
  }

  // ----- Janela -----
  function opcoesFaixas(){
    var sel = janela.querySelector('[name=faixa]');
    sel.textContent = '';
    dados().faixas.forEach(function(f, i){
      var o = el('option', '', (f.numero < 10 ? '0' : '') + f.numero + ' · ' + f.titulo);
      o.value = i; sel.appendChild(o);
    });
    sel.value = estado.faixa;
  }
  function atualizar(){
    var exclusivo = comprou();
    [].forEach.call(janela.querySelectorAll('[data-exclusivo]'), function(e){ e.hidden = !exclusivo; });
    if (!exclusivo && estado.modo === 'apoiei') estado.modo = 'album';
    [].forEach.call(janela.querySelectorAll('[name=modo]'), function(r){ r.checked = r.value === estado.modo; });
    janela.querySelector('.cartao-faixa').hidden = estado.modo !== 'faixa';
    gerar();
  }

  function criarJanela(){
    janela = el('dialog', 'compartilhar-janela');
    janela.setAttribute('aria-label', 'Compartilhar');
    janela.innerHTML =
      '<div class="compartilhar-in">'
      + '<button type="button" class="fechar" aria-label="Fechar">&times;</button>'
      + '<h2>Compartilhar</h2>'
      + '<div class="cartao-grade">'
      + '<div class="cartao-previa"><img alt="Prévia do cartão para os Stories" width="270" height="480"></div>'
      + '<div class="cartao-opcoes">'
      + '<fieldset class="cartao-modos"><legend>Cartão</legend>'
      + '<label><input type="radio" name="modo" value="album"> O álbum</label>'
      + '<label><input type="radio" name="modo" value="faixa"> Uma faixa</label>'
      + '<label data-exclusivo><input type="radio" name="modo" value="apoiei"> Apoiei Correnteza</label>'
      + '</fieldset>'
      + '<label class="cartao-faixa">Faixa <select name="faixa"></select></label>'
      + '<div class="cartao-acoes">'
      + '<button type="button" class="botao" data-acao="compartilhar">Compartilhar</button>'
      + '<button type="button" class="botao contorno" data-acao="baixar">Baixar imagem</button>'
      + '<button type="button" class="link" data-acao="copiar">Copiar o link</button>'
      + '</div>'
      + '<p class="cartao-nota apoie-nota" role="status"></p>'
      + '</div></div></div>';
    janela.querySelector('.fechar').addEventListener('click', function(){ janela.close(); });
    janela.addEventListener('click', function(e){ if (e.target === janela) janela.close(); });
    [].forEach.call(janela.querySelectorAll('[name=modo]'), function(r){
      r.addEventListener('change', function(){ estado.modo = r.value; atualizar(); });
    });
    janela.querySelector('[name=faixa]').addEventListener('change', function(){ estado.faixa = Number(this.value); atualizar(); });
    janela.querySelector('[data-acao=compartilhar]').addEventListener('click', compartilhar);
    janela.querySelector('[data-acao=baixar]').addEventListener('click', baixar);
    janela.querySelector('[data-acao=copiar]').addEventListener('click', function(){
      copiarLink();
      janela.querySelector('.cartao-nota').textContent = 'Link copiado: ' + linkDoCartao();
    });
    document.body.appendChild(janela);
  }

  function copiarLink(){
    try { if (navigator.clipboard) navigator.clipboard.writeText(linkDoCartao()).catch(function(){}); } catch (e) {}
  }
  function baixar(){
    if (!urlImagem) return;
    var a = el('a'); a.href = urlImagem; a.download = arquivo ? arquivo.name : 'correnteza.png';
    document.body.appendChild(a); a.click(); a.remove();
    copiarLink();
    C.evento('compartilhar');
  }
  function compartilhar(){
    if (!arquivo) return;
    copiarLink(); // dentro do toque, antes do menu abrir
    var pacote = { files: [arquivo] };
    if (navigator.canShare && navigator.canShare(pacote)){
      navigator.share(pacote).then(function(){ C.evento('compartilhar'); }, function(){});
    } else {
      baixar();
      janela.querySelector('.cartao-nota').textContent = 'Imagem baixada e link copiado. Poste a imagem nos Stories e cole o link no adesivo de link.';
    }
  }

  C.compartilhar = function(opcoes){
    if (typeof HTMLDialogElement === 'undefined' || !dados().faixas.length) return;
    opcoes = opcoes || {};
    if (!janela) criarJanela();
    estado.modo = opcoes.modo || 'album';
    estado.faixa = typeof opcoes.faixa === 'number' ? opcoes.faixa : estado.faixa;
    opcoesFaixas();
    if (!janela.open) janela.showModal();
    atualizar();
  };

  // ----- Onde os botões ficam -----
  var bt = document.getElementById('btCompartilhar');
  if (bt) bt.addEventListener('click', function(){
    var titulo = document.getElementById('tocadorTitulo').textContent;
    var i = dados().faixas.map(function(f){ return f.titulo; }).indexOf(titulo);
    C.compartilhar({ modo: 'faixa', faixa: i >= 0 ? i : 0 });
  });
  var btAlbum = document.getElementById('btCompartilharAlbum');
  if (btAlbum) btAlbum.addEventListener('click', function(){ C.compartilhar({ modo: 'album' }); });
  var btApoiei = document.getElementById('btApoiei');
  if (btApoiei) btApoiei.addEventListener('click', function(){ C.compartilhar({ modo: 'apoiei' }); });
})();
