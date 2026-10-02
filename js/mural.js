// Mural dos ouvintes: comentários sobre o álbum ou sobre cada faixa.
// Quem tem o código comenta como apoiador (sem informar e-mail); quem não comprou informa o e-mail,
// que nunca aparece no site. Os comentários passam pela moderação da dupla (admin.html).
(function(){
  var C = window.Correnteza;
  var form = document.getElementById('formMural');
  if (!form) return;
  var lista = document.getElementById('comentarios');
  var vazio = document.getElementById('muralVazio');
  var filtro = document.getElementById('muralFiltro');
  var sobre = document.getElementById('muralSobre');
  var msg = document.getElementById('msgMural');
  var campos = {
    nome: document.getElementById('muralNome'),
    cidade: document.getElementById('muralCidade'),
    texto: document.getElementById('muralTexto'),
    email: document.getElementById('muralEmail'),
    novidades: document.getElementById('muralNovidades')
  };
  var comentarios = [];
  var titulos = {};

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function avisar(t){ msg.textContent = t || ''; msg.hidden = !t; }
  function data(iso){
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // nome e cidade ficam lembrados neste navegador para o próximo comentário
  campos.nome.value = C.ler('correnteza.mural.nome') || '';
  campos.cidade.value = C.ler('correnteza.mural.cidade') || '';

  function desenhar(){
    var escolha = filtro.value;
    lista.textContent = '';
    var mostrados = comentarios.filter(function(c){
      return !escolha || (escolha === 'album' ? !c.faixa : c.faixa === escolha);
    });
    mostrados.forEach(function(c){
      var li = el('li', 'comentario' + (c.apoiador ? ' apoiador' : ''));
      var cab = el('p', 'comentario-cab');
      cab.appendChild(el('b', '', c.nome));
      if (c.cidade) cab.appendChild(el('span', 'cidade', c.cidade));
      if (c.apoiador) cab.appendChild(el('span', 'selo', 'apoiador'));
      li.appendChild(cab);
      li.appendChild(el('p', 'comentario-texto', c.texto));
      var pe = el('p', 'comentario-pe', data(c.quando));
      if (c.faixa && titulos[c.faixa]) pe.textContent += ' · sobre ' + titulos[c.faixa];
      li.appendChild(pe);
      lista.appendChild(li);
    });
    vazio.hidden = mostrados.length > 0;
  }

  function carregar(){
    return C.pedirJson('/api/comentarios').then(function(r){
      comentarios = r.comentarios || [];
      desenhar();
    }, function(){ vazio.hidden = false; vazio.textContent = 'Não foi possível carregar o mural agora.'; });
  }

  // faixas nos seletores, com os títulos que vêm da API
  C.aoCarregar(function(d){
    titulos = {};
    [[sobre, 'O álbum inteiro'], [filtro, null]].forEach(function(par){
      var sel = par[0], valor = sel.value;
      while (sel.options.length > (par[1] ? 1 : 2)) sel.remove(sel.options.length - 1);
      d.faixas.forEach(function(f){
        titulos[f.id] = f.titulo;
        var o = el('option', '', (par[1] ? '' : 'Sobre ') + f.titulo);
        o.value = f.id; sel.appendChild(o);
      });
      sel.value = valor;
    });
    desenhar();
  });
  filtro.addEventListener('change', desenhar);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var comprou = document.body.classList.contains('com-acesso');
    var corpo = {
      nome: campos.nome.value.trim(),
      cidade: campos.cidade.value.trim(),
      texto: campos.texto.value.trim(),
      faixa: sobre.value,
      novidades: campos.novidades.checked
    };
    if (corpo.texto.length < 3){ avisar('Escreva seu comentário.'); campos.texto.focus(); return; }
    if (corpo.nome.length < 2){ avisar('Escreva seu nome.'); campos.nome.focus(); return; }
    if (comprou){
      var c = C.credenciais(); corpo.token = c.token; corpo.aparelho = c.aparelho;
    } else {
      corpo.email = campos.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(corpo.email)){ avisar('Informe um e-mail válido. Ele não aparece no mural.'); campos.email.focus(); return; }
    }
    avisar('');
    var botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    C.pedirJson('/api/comentarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
    }).then(function(r){
      botao.disabled = false;
      if (!r.ok){ avisar(r.mensagem || 'Não foi possível enviar agora. Tente de novo.'); return; }
      C.gravar('correnteza.mural.nome', corpo.nome);
      C.gravar('correnteza.mural.cidade', corpo.cidade);
      campos.texto.value = '';
      C.evento('comentario');
      if (r.status === 'publicado'){ avisar('Pronto! Seu comentário já está no mural.'); carregar(); }
      else if (r.status === 'confirmar_email') avisar('Quase lá: enviamos um link para o seu e-mail. Confirme por ele para o comentário seguir para o mural.');
      else avisar('Recebemos seu comentário! Ele aparece aqui depois que a dupla ler.');
    }, function(){
      botao.disabled = false;
      avisar('Sem conexão agora. Verifique a internet e tente de novo.');
    });
  });

  // link do e-mail de confirmação: correnteza.html?confirmar=ID.SEGREDO#mural
  var params = new URLSearchParams(location.search);
  var confirmar = params.get('confirmar');
  if (confirmar){
    params.delete('confirmar');
    var resto = params.toString();
    history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + '#mural');
    var partes = confirmar.split('.');
    C.pedirJson('/api/comentarios/confirmar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: partes[0], segredo: partes[1] || '' })
    }).then(function(r){
      avisar(!r.ok ? (r.mensagem || 'Não foi possível confirmar agora.')
        : r.status === 'publicado' ? 'E-mail confirmado! Seu comentário já está no mural.'
        : 'E-mail confirmado! Seu comentário aparece aqui depois que a dupla ler.');
      if (r.status === 'publicado') carregar();
      document.getElementById('mural').scrollIntoView();
    }, function(){ avisar('Sem conexão agora. Abra o link do e-mail de novo em instantes.'); });
  }

  carregar();
})();
