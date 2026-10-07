// Página de administração: moderação do mural e resumo de vendas, funil e lista de e-mails.
// A senha fica só nesta aba do navegador (sessionStorage) e vai em cada pedido à API.
(function(){
  var API = ((document.querySelector('meta[name="correnteza-api"]') || {}).content || '').replace(/\/$/, '');
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = 'http://localhost:8787';
  var ETAPAS = [
    ['visita', 'visitas'], ['previa', 'ouviram prévia'], ['previa_fim', 'prévia até o fim'], ['abrir_compra', 'abriram a compra'],
    ['pagamento', 'viram o pagamento'], ['compra', 'compraram'], ['novidades', 'pediram novidades'], ['compartilhar', 'compartilharam'],
    ['comentario', 'comentaram'], ['links', 'abriram os links']
  ];
  var senha = '';
  try { senha = sessionStorage.getItem('correnteza.admin') || ''; } catch (e) {}
  var status = 'pendente';
  var titulos = {};
  var msg = document.getElementById('msg');

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function avisar(t){ msg.textContent = t || ''; msg.hidden = !t; }
  function reais(v){ return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function quando(iso){ var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }

  function api(caminho, opcoes){
    opcoes = opcoes || {};
    opcoes.headers = Object.assign({ Authorization: 'Bearer ' + senha }, opcoes.headers || {});
    opcoes.cache = 'no-store';
    return fetch(API + caminho, opcoes).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if (r.status === 401 || r.status === 429 || r.status === 503){ sair(); throw new Error(d.mensagem || 'Sem acesso.'); }
        if (!r.ok) throw new Error(d.mensagem || d.erro || 'Erro ' + r.status);
        return d;
      });
    });
  }

  function tabela(caixa, cabecalho, linhas){
    caixa.textContent = '';
    if (!linhas.length){ caixa.appendChild(el('p', 'apoie-nota', 'Nada no período.')); return; }
    var t = el('table'), th = el('tr');
    cabecalho.forEach(function(c){ th.appendChild(el('th', '', c)); });
    var thead = el('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = el('tbody');
    linhas.forEach(function(l){ var tr = el('tr'); l.forEach(function(c){ tr.appendChild(el('td', '', String(c))); }); tb.appendChild(tr); });
    t.appendChild(tb);
    caixa.appendChild(t);
  }

  function resumo(){
    return api('/api/admin/resumo?dias=' + document.getElementById('dias').value).then(function(r){
      var vendas = r.vendas.reduce(function(s, v){ return s + v.pedidos; }, 0);
      var valor = r.vendas.reduce(function(s, v){ return s + (v.valor || 0); }, 0);
      var pendentes = (r.mural.filter(function(m){ return m.status === 'pendente'; })[0] || {}).total || 0;
      var cartoes = document.getElementById('cartoes');
      cartoes.textContent = '';
      [[vendas, 'vendas no período'], [reais(valor), 'arrecadado (antes das taxas)'], [r.lista.recebem_novidades || 0, 'e-mails que recebem novidades'],
       [r.lista.compradores || 0, 'compradores na lista'], [pendentes, 'comentários esperando']].forEach(function(c){
        var d = el('div'); d.appendChild(el('b', '', c[0])); d.appendChild(el('span', '', c[1])); cartoes.appendChild(d);
      });
      // funil: uma linha por origem, uma coluna por etapa
      var origens = {};
      r.funil.forEach(function(f){ (origens[f.origem] = origens[f.origem] || {})[f.evento] = f.total; });
      tabela(document.getElementById('funil'), ['origem'].concat(ETAPAS.map(function(e){ return e[1]; })),
        Object.keys(origens).sort(function(a, b){ return (origens[b].visita || 0) - (origens[a].visita || 0); }).map(function(o){
          return [o].concat(ETAPAS.map(function(e){ return origens[o][e[0]] || 0; }));
        }));
      tabela(document.getElementById('ouvidas'), ['faixa', 'prévias', 'completas', 'total'], (r.reproducoes || []).map(function(f){
        return [titulos[f.faixa] || f.faixa, f.previas, f.completas, f.previas + f.completas];
      }));
      tabela(document.getElementById('vendas'), ['origem', 'vendas', 'valor'], r.vendas.map(function(v){ return [v.origem, v.pedidos, reais(v.valor)]; }));
    });
  }

  function comentarios(){
    var caixa = document.getElementById('comentarios');
    caixa.textContent = 'Carregando…';
    return api('/api/admin/comentarios?status=' + status).then(function(r){
      caixa.textContent = '';
      if (!r.comentarios.length){ caixa.appendChild(el('p', 'apoie-nota', 'Nenhum comentário aqui.')); return; }
      r.comentarios.forEach(function(c){
        var d = el('article', 'admin-comentario');
        var cab = el('p'); cab.appendChild(el('b', '', c.nome + (c.cidade ? ' · ' + c.cidade : '')));
        if (c.apoiador) cab.appendChild(el('span', 'selo', ' apoiador'));
        d.appendChild(cab);
        d.appendChild(el('p', 'meta', quando(c.criado_em) + ' · ' + (c.faixa ? 'sobre ' + (titulos[c.faixa] || c.faixa) : 'sobre o álbum') + ' · ' + c.email));
        d.appendChild(el('p', 'texto', c.texto));
        var acoes = el('div', 'acoes');
        [['publicar', 'Publicar', ''], ['recusar', 'Recusar', ' contorno'], ['apagar', 'Apagar de vez', ' contorno']].forEach(function(a){
          if (a[0] === 'publicar' && c.status === 'publicado') return;
          if (a[0] === 'recusar' && c.status === 'recusado') return;
          var b = el('button', 'botao pequeno' + a[2], a[1]); b.type = 'button';
          b.addEventListener('click', function(){
            if (a[0] === 'apagar' && !confirm('Apagar este comentário de vez?')) return;
            b.disabled = true;
            api('/api/admin/comentarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, acao: a[0] }) })
              .then(function(){ d.remove(); resumo(); }, function(e){ b.disabled = false; avisar(e.message); });
          });
          acoes.appendChild(b);
        });
        d.appendChild(acoes);
        caixa.appendChild(d);
      });
    });
  }

  function entrar(){
    avisar('');
    return Promise.all([resumo(), comentarios()]).then(function(){
      try { sessionStorage.setItem('correnteza.admin', senha); } catch (e) {}
      document.getElementById('formEntrar').hidden = true;
      document.getElementById('painel').hidden = false;
    }, function(e){ avisar(e.message); });
  }
  function sair(){
    senha = '';
    try { sessionStorage.removeItem('correnteza.admin'); } catch (e) {}
    document.getElementById('formEntrar').hidden = false;
    document.getElementById('painel').hidden = true;
  }

  // títulos das faixas para mostrar "sobre Lúgubre" em vez do id
  fetch(API + '/api/album').then(function(r){ return r.json(); }).then(function(d){
    (d.faixas || []).forEach(function(f){ titulos[f.id] = f.titulo; });
  }).catch(function(){});

  document.getElementById('formEntrar').addEventListener('submit', function(e){
    e.preventDefault();
    senha = document.getElementById('senha').value;
    document.getElementById('senha').value = '';
    entrar();
  });
  document.getElementById('dias').addEventListener('change', function(){ resumo().catch(function(e){ avisar(e.message); }); });
  [].forEach.call(document.querySelectorAll('#abas button'), function(b){
    b.addEventListener('click', function(){
      status = b.dataset.status;
      [].forEach.call(document.querySelectorAll('#abas button'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      comentarios().catch(function(e){ avisar(e.message); });
    });
  });
  document.getElementById('btSairAdmin').addEventListener('click', sair);
  if (senha) entrar();
})();
