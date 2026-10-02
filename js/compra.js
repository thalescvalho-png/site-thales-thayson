// Compra do álbum: formulário do Mercado Pago (Payment Brick), Pix com consulta automática,
// código de acesso digitado e a tela de "obrigado" com o encarte em PDF.
// O preço cobrado é sempre o do servidor; aqui ele só é mostrado.
(function(){
  var C = window.Correnteza;
  var CHAVE_MP = ((document.querySelector('meta[name="mp-public-key"]') || {}).content || '').trim();
  var secao = document.getElementById('apoie');
  var formCompra = document.getElementById('formCompra');
  var campoEmail = document.getElementById('email');
  var campoNovidades = document.getElementById('novidades');
  var botaoComprar = document.getElementById('botaoComprar');
  var brick = document.getElementById('brickPagamento');
  var nota = document.getElementById('notaCompra');
  var mensagem = document.getElementById('mensagemCompra');
  var jaComprei = document.getElementById('jaComprei');
  var formCodigo = document.getElementById('formCodigo');
  var campoCodigo = document.getElementById('campoCodigo');
  var controleBrick = null;
  var consulta = null;

  var MOTIVOS = {
    codigo_invalido: 'Esse código não foi encontrado. Confira as letras e os números (o código está no e-mail que enviamos).',
    limite_aparelhos: 'Esse código já está no número máximo de aparelhos. Desconecte um aparelho antigo logo abaixo para ouvir neste.',
    muitas_tentativas: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
    sem_aparelho: 'Não foi possível identificar este navegador. Tente de novo ou use outro navegador.'
  };

  function avisar(texto){ mensagem.textContent = texto || ''; mensagem.hidden = !texto; }
  function etapa(nome){
    var antes = secao.dataset.estado;
    secao.dataset.estado = nome;
    [].forEach.call(secao.querySelectorAll('.etapa'), function(e){ e.hidden = e.dataset.etapa !== nome; });
    jaComprei.hidden = nome === 'liberado';
    // a tela de boas-vindas surge de novo a cada vez que o álbum é liberado
    if (nome === 'liberado' && antes !== 'liberado'){
      secao.classList.remove('surgindo'); void secao.offsetWidth; secao.classList.add('surgindo');
    }
    plancton(nome === 'liberado');
  }
  function irPara(){ secao.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function reais(v){ return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function copiar(texto, botao){
    var original = botao.textContent;
    var pronto = function(){ botao.textContent = 'copiado!'; setTimeout(function(){ botao.textContent = original; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(pronto, function(){});
  }

  // ----- O que a API devolveu: preço, acesso liberado ou código recusado -----
  C.aoCarregar(function(d, codigoTentado){
    [].forEach.call(document.querySelectorAll('[data-preco]'), function(e){ e.textContent = reais(d.preco); });
    if (d.acesso){
      pararConsulta();
      C.gravar('correnteza.pedido', null);
      // só player: no lugar do download do álbum fica o do encarte em PDF
      var zip = document.getElementById('baixarZip');
      zip.hidden = !d.zip;
      if (d.zip) zip.href = d.zip;
      if (d.encarte) document.getElementById('baixarEncarte').href = d.encarte.pdf;
      avisar('');
      etapa('liberado');
      return;
    }
    if (secao.dataset.estado === 'liberado'){ etapa('comprar'); formCompra.hidden = !CHAVE_MP; }
    if (codigoTentado && d.motivo){
      // no limite de aparelhos, o painel com a lista (js/aparelhos.js) já explica o que fazer
      var painel = d.motivo === 'limite_aparelhos' && C.mostrarLimite;
      avisar(painel ? '' : MOTIVOS[d.motivo] || 'Não foi possível usar esse código agora.');
      jaComprei.open = !painel;
      if (painel) C.mostrarLimite();
    }
  });

  // ----- Plâncton: pontos de luz que sobem devagar atrás da tela de boas-vindas -----
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tela = null, pontos = [], quadroP = 0, visivelP = false, ligadoP = false;
  var CORES_P = ['95,242,224', '57,200,255', '120,170,255', '198,139,62'];
  function plancton(ligar){
    ligadoP = ligar;
    if (ligar && !tela){
      tela = document.createElement('canvas');
      tela.className = 'plancton'; tela.setAttribute('aria-hidden', 'true');
      secao.insertBefore(tela, secao.firstChild);
      if ('IntersectionObserver' in window){
        new IntersectionObserver(function(e){ visivelP = e[0].isIntersecting; girarP(); }).observe(secao);
      } else visivelP = true;
    }
    if (tela) tela.hidden = !ligar;
    girarP();
  }
  function girarP(){
    cancelAnimationFrame(quadroP);
    if (!tela || !ligadoP) return;
    var r = secao.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (tela.width !== Math.round(r.width * dpr) || tela.height !== Math.round(r.height * dpr)){
      tela.width = Math.round(r.width * dpr); tela.height = Math.round(r.height * dpr);
    }
    var ctx = tela.getContext('2d'), w = r.width, h = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var total = Math.round(Math.min(120, w * h / 9000));
    while (pontos.length < total) pontos.push(novoPonto(w, h, true));
    pontos.length = total;
    var ultimo = performance.now();
    function quadro(agora){
      var dt = Math.min(50, agora - ultimo) / 16.7; ultimo = agora;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      pontos.forEach(function(p, i){
        p.x += p.vx * dt + Math.sin((agora / 1000) * p.f + p.fase) * .25 * dt;
        p.y += p.vy * dt;
        p.vida += dt;
        if (p.y < -10 || p.vida > p.max) pontos[i] = p = novoPonto(w, h, false);
        var a = Math.sin(Math.PI * p.vida / p.max) * p.brilho;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(' + p.cor + ',' + a.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + p.cor + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r * 4, p.y - p.r * 4, p.r * 8, p.r * 8);
      });
      if (!reduzir && visivelP) quadroP = requestAnimationFrame(quadro);
    }
    quadro(ultimo);
  }
  function novoPonto(w, h, espalhado){
    return {
      x: Math.random() * w, y: espalhado ? Math.random() * h : h * (.6 + Math.random() * .45),
      vx: (Math.random() - .5) * .15, vy: -(.12 + Math.random() * .35),
      r: .8 + Math.random() * 2.2, brilho: .35 + Math.random() * .6,
      cor: CORES_P[Math.random() < .12 ? 3 : Math.floor(Math.random() * 3)],
      f: .3 + Math.random() * .8, fase: Math.random() * 6.3,
      vida: espalhado ? Math.random() * 400 : 0, max: 300 + Math.random() * 500
    };
  }
  window.addEventListener('resize', function(){ if (ligadoP) girarP(); });

  // ----- Código digitado -----
  formCodigo.addEventListener('submit', function(e){
    e.preventDefault();
    var codigo = campoCodigo.value.trim();
    if (codigo.replace(/[^0-9a-z]/gi, '').length < 8){ avisar('Digite o código completo, como está no e-mail.'); return; }
    avisar('');
    C.usarCodigo(codigo).then(function(d){
      if (d.acesso){ campoCodigo.value = ''; jaComprei.open = false; irPara(); }
    }, function(){ avisar('Não foi possível conferir o código agora. Verifique a internet e tente de novo.'); });
  });

  document.getElementById('btOuvirTudo').addEventListener('click', function(){
    // só leva até a lista; a música começa quando a pessoa escolhe uma faixa
    document.getElementById('ouvir').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('baixarEncarte').addEventListener('click', function(e){
    var d = C.dados();
    if (d && d.encarte) this.href = d.encarte.pdf;
    C.abrirPdf(e);
  });
  document.getElementById('btSair').addEventListener('click', function(){
    if (!confirm('Tirar o acesso ao álbum deste aparelho? A vaga dele fica livre para outro aparelho. Para voltar, basta digitar o código de novo.')) return;
    if (C.sairDeVez) C.sairDeVez(); else C.sair();
  });

  // ----- Pagamento -----
  if (!CHAVE_MP){
    formCompra.hidden = true;
    nota.textContent = 'O pagamento pelo site abre em breve. Se você já tem um código, use a opção abaixo.';
  }

  // o cartão do preço abre o formulário de compra; o botão do fim da página leva até ele
  var btAdquirir = document.getElementById('btAdquirir');
  function abrirCompra(){
    btAdquirir.setAttribute('aria-expanded', 'true');
    secao.classList.add('comprando');
    nota.hidden = false;
    C.evento('abrir_compra');
    if (CHAVE_MP && !controleBrick){ formCompra.hidden = false; campoEmail.focus({ preventScroll: true }); }
  }
  btAdquirir.addEventListener('click', abrirCompra);
  [].forEach.call(document.querySelectorAll('[data-comprar]'), function(a){
    a.addEventListener('click', function(e){ e.preventDefault(); abrirCompra(); irPara(); });
  });

  formCompra.addEventListener('submit', function(e){
    e.preventDefault();
    var email = campoEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ avisar('Informe um e-mail válido. É nele que você recebe o código de acesso.'); campoEmail.focus(); return; }
    avisar('');
    abrirPagamento(email);
  });

  function carregarSdk(){
    if (window.MercadoPago) return Promise.resolve();
    return new Promise(function(ok, falha){
      var s = document.createElement('script');
      s.src = 'https://sdk.mercadopago.com/js/v2';
      s.onload = ok; s.onerror = falha;
      document.head.appendChild(s);
    });
  }

  function abrirPagamento(email){
    var d = C.dados();
    botaoComprar.disabled = true;
    botaoComprar.textContent = 'Carregando o pagamento…';
    carregarSdk().then(function(){
      if (controleBrick){ controleBrick.unmount(); controleBrick = null; }
      var mp = new window.MercadoPago(CHAVE_MP, { locale: 'pt-BR' });
      return mp.bricks().create('payment', 'brickPagamento', {
        initialization: { amount: d ? d.preco : 22.9, payer: { email: email } },
        customization: {
          paymentMethods: { bankTransfer: ['pix'], creditCard: 'all', debitCard: 'all', maxInstallments: 3 },
          visual: { style: { theme: 'dark', customVariables: { baseColor: '#C68B3E' } } }
        },
        callbacks: {
          onReady: function(){
            C.evento('pagamento');
            formCompra.hidden = true;
            brick.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
          onSubmit: function(r){ return pagar(r, email); },
          onError: function(erro){ console.error(erro); }
        }
      });
    }).then(function(controle){
      controleBrick = controle;
    }, function(){
      avisar('Não foi possível abrir o pagamento. Verifique a internet e tente de novo.');
    }).then(function(){
      botaoComprar.disabled = false;
      botaoComprar.textContent = 'Ir para o pagamento';
    });
  }

  // o Brick espera uma Promise: resolvida = deu certo; rejeitada = ele deixa a pessoa tentar de novo
  function pagar(r, email){
    avisar('');
    return C.pedirJson('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPaymentMethod: r.selectedPaymentMethod, formData: r.formData, email: email, novidades: campoNovidades.checked, origem: C.origem() })
    }).then(function(res){
      if (res._status >= 400 || !res.pedido){
        avisar(res.mensagem || 'Não foi possível processar o pagamento. Confira os dados e tente de novo.');
        throw new Error(res.erro || 'checkout');
      }
      if (res.codigo){ liberar(res.codigo); return; }
      if (res.pix){ mostrarPix(res.pedido, res.pix); return; }
      if (res.status === 'rejected'){
        avisar('O pagamento foi recusado pelo banco ou pelo Mercado Pago. Confira os dados do cartão ou escolha outra forma de pagamento.');
        throw new Error('recusado');
      }
      // cartão em análise
      C.gravar('correnteza.pedido', JSON.stringify({ id: res.pedido }));
      etapa('analise');
      irPara();
      consultar(res.pedido);
    }, function(erro){
      avisar('Sem conexão com o servidor de pagamento. Verifique a internet e tente de novo.');
      throw erro;
    });
  }

  function liberar(codigo){
    C.evento('compra');
    pararConsulta();
    C.gravar('correnteza.pedido', null);
    if (controleBrick){ controleBrick.unmount(); controleBrick = null; }
    C.usarCodigo(codigo).then(irPara, function(){
      // se a API falhar agora, o código já está guardado e funciona na próxima visita
      avisar('Pagamento aprovado! Seu código é ' + codigo + '. Ele também foi enviado para o seu e-mail.');
    });
  }

  // ----- Pix: QR code, copia e cola e consulta até o pagamento cair -----
  function mostrarPix(pedido, pix){
    C.gravar('correnteza.pedido', JSON.stringify({ id: pedido, pix: pix }));
    if (pix.qr_code_base64) document.getElementById('pixQr').src = 'data:image/png;base64,' + pix.qr_code_base64;
    document.getElementById('pixCopia').value = pix.copia_e_cola || '';
    var validade = document.getElementById('pixValidade');
    var expira = pix.expira_em ? new Date(pix.expira_em) : null;
    validade.textContent = expira && !isNaN(expira) ? 'Este Pix vale até ' + expira.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' : '';
    document.getElementById('textoAguardando').textContent = 'Aguardando o pagamento…';
    etapa('pix');
    irPara();
    consultar(pedido, expira);
  }

  document.getElementById('btCopiarPix').addEventListener('click', function(){
    var campo = document.getElementById('pixCopia');
    campo.select();
    copiar(campo.value, this);
  });
  document.getElementById('btCancelarPix').addEventListener('click', function(){
    pararConsulta();
    C.gravar('correnteza.pedido', null);
    etapa('comprar');
    formCompra.hidden = !CHAVE_MP;
    if (controleBrick){ controleBrick.unmount(); controleBrick = null; }
    irPara();
  });

  function pararConsulta(){ if (consulta){ clearTimeout(consulta); consulta = null; } }

  function consultar(pedido, expira){
    pararConsulta();
    var espera = 4000;
    function rodada(){
      // depois do vencimento do Pix, ainda confere por 10 minutos (o banco pode demorar a avisar)
      if (expira && Date.now() > expira.getTime() + 10 * 60000){ fim('O tempo para pagar este Pix acabou. Gere um novo para concluir a compra.'); return; }
      C.pedirJson('/api/order/' + encodeURIComponent(pedido), { cache: 'no-store' }).then(function(r){
        if (r.pago && r.codigo){ liberar(r.codigo); return; }
        if (r._status === 404){ fim('Não encontramos este pedido. Tente comprar de novo.'); return; }
        if (r.status === 'rejected' || r.status === 'cancelled' || r.status === 'expired'){
          fim(secao.dataset.estado === 'pix' ? 'Este Pix expirou ou foi cancelado. Gere um novo para concluir a compra.' : 'O pagamento não foi aprovado. Tente de novo com outra forma de pagamento.');
          return;
        }
        espera = r._status === 429 ? 20000 : document.hidden ? 15000 : 4000;
        consulta = setTimeout(rodada, espera);
      }, function(){
        consulta = setTimeout(rodada, 10000);
      });
    }
    consulta = setTimeout(rodada, espera);
  }
  function fim(texto){
    pararConsulta();
    C.gravar('correnteza.pedido', null);
    etapa('comprar');
    formCompra.hidden = !CHAVE_MP;
    avisar(texto);
  }

  // quem fechou a página no meio de um Pix ou de uma análise volta para onde estava
  var pendente = null;
  try { pendente = JSON.parse(C.ler('correnteza.pedido') || 'null'); } catch (e) {}
  if (pendente && pendente.id){
    C.pronto.catch(function(){}).then(function(){
      var d = C.dados();
      if (d && d.acesso) return;
      if (pendente.pix) mostrarPix(pendente.id, pendente.pix);
      else { etapa('analise'); consultar(pendente.id); }
    });
  }
})();
