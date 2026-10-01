// Compra do álbum: formulário do Mercado Pago (Payment Brick), Pix com consulta automática,
// código de acesso digitado e a tela de "obrigado" com os downloads.
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
    limite_aparelhos: 'Esse código já foi usado no número máximo de aparelhos. Fale com a gente pelo contato da página inicial para liberar.',
    muitas_tentativas: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
    sem_aparelho: 'Não foi possível identificar este navegador. Tente de novo ou use outro navegador.'
  };

  function avisar(texto){ mensagem.textContent = texto || ''; mensagem.hidden = !texto; }
  function etapa(nome){
    secao.dataset.estado = nome;
    [].forEach.call(secao.querySelectorAll('.etapa'), function(e){ e.hidden = e.dataset.etapa !== nome; });
    jaComprei.hidden = nome === 'liberado';
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
      document.getElementById('codigoMostrado').textContent = d.codigo;
      document.getElementById('baixarZip').href = d.zip;
      document.getElementById('baixarPdf').href = d.encarte.pdf;
      avisar('');
      etapa('liberado');
      return;
    }
    if (secao.dataset.estado === 'liberado'){ etapa('comprar'); formCompra.hidden = !CHAVE_MP; }
    if (codigoTentado && d.motivo){
      avisar(MOTIVOS[d.motivo] || 'Não foi possível usar esse código agora.');
      jaComprei.open = true;
    }
  });

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

  document.getElementById('btCopiarCodigo').addEventListener('click', function(){
    copiar(document.getElementById('codigoMostrado').textContent, this);
  });
  document.getElementById('btSair').addEventListener('click', function(){
    if (!confirm('Tirar o acesso ao álbum deste aparelho? Para voltar, basta digitar o código de novo.')) return;
    C.sair();
  });

  // ----- Pagamento -----
  if (!CHAVE_MP){
    formCompra.hidden = true;
    nota.textContent = 'O pagamento pelo site abre em breve. Se você já tem um código, use a opção abaixo.';
  }

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
      body: JSON.stringify({ selectedPaymentMethod: r.selectedPaymentMethod, formData: r.formData, email: email, novidades: campoNovidades.checked })
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
