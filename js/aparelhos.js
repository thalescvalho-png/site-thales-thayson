// Aparelhos do comprador: a lista "Meus aparelhos" na tela de boas-vindas e, quando o código já está
// no limite, a opção de desconectar um aparelho antigo para ouvir neste. Também avisa quem abriu a página
// dentro do Instagram/Facebook, onde o acesso não fica guardado e o mesmo celular conta como outro aparelho.
(function(){
  var C = window.Correnteza;
  var limite = document.getElementById('limiteAparelhos');
  var meus = document.getElementById('meusAparelhos');

  function el(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function aparelhos(n){ return n + (n === 1 ? ' aparelho' : ' aparelhos'); }
  function data(iso){
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  function listar(){
    return C.pedirJson('/api/aparelhos' + C.consulta(), { cache: 'no-store' }).then(function(r){
      if (!r.aparelhos) throw new Error(r.erro || 'aparelhos');
      return r;
    });
  }
  function liberar(ref){
    var corpo = C.credenciais(); corpo.ref = ref;
    return C.pedirJson('/api/aparelhos/liberar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
    });
  }

  // desenha a lista dentro de um [data-aparelhos]; noLimite = este aparelho ainda não entrou
  function desenhar(caixa, r, noLimite){
    caixa.textContent = '';
    var ul = el('ul', 'aparelhos-lista');
    r.aparelhos.forEach(function(a){
      var li = el('li');
      var info = el('div', 'aparelho-info');
      var nome = el('b', '', a.nome);
      if (a.este) nome.appendChild(el('span', 'selo', 'este aparelho'));
      else if (a.tocando) nome.appendChild(el('span', 'selo', 'tocou por último'));
      info.appendChild(nome);
      info.appendChild(el('small', '', 'desde ' + data(a.primeiroUso) + ' · usado em ' + data(a.ultimoUso)));
      li.appendChild(info);
      if (!a.este){
        var b = el('button', 'botao contorno pequeno', 'Desconectar');
        b.type = 'button';
        b.disabled = r.trocasRestantes <= 0;
        b.addEventListener('click', function(){
          if (!confirm('Desconectar ' + a.nome + '? Ele deixa de tocar o álbum até o código ser digitado de novo nele.')) return;
          b.disabled = true;
          liberar(a.ref).then(function(res){
            if (!res.ok){ nota.textContent = res.mensagem || 'Não foi possível desconectar agora.'; b.disabled = false; return; }
            if (noLimite) C.carregar(); // agora há vaga: este aparelho entra
            else desenhar(caixa, res, false);
          }, function(){ nota.textContent = 'Sem conexão agora. Tente de novo.'; b.disabled = false; });
        });
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
    caixa.appendChild(ul);
    var nota = el('p', 'apoie-nota');
    nota.textContent = r.trocasRestantes > 0
      ? 'Seu código vale em até ' + aparelhos(r.limite) + '. Você ainda pode desconectar ' + aparelhos(r.trocasRestantes) + ' este mês.'
      : 'Você já trocou de aparelho várias vezes este mês. Para liberar mais uma troca, fale com a gente pelo WhatsApp da página inicial.';
    caixa.appendChild(nota);
  }

  function mostrarLimite(){
    if (!limite) return;
    var caixa = limite.querySelector('[data-aparelhos]');
    caixa.textContent = 'Carregando seus aparelhos…';
    limite.hidden = false;
    listar().then(function(r){
      limite.querySelector('[data-limite]').textContent = aparelhos(r.limite);
      desenhar(caixa, r, true);
    }, function(){
      caixa.textContent = 'Não foi possível carregar a lista agora. Fale com a gente pelo WhatsApp da página inicial para liberar.';
    });
  }

  if (meus){
    meus.addEventListener('toggle', function(){
      if (!meus.open) return;
      var caixa = meus.querySelector('[data-aparelhos]');
      caixa.textContent = 'Carregando…';
      listar().then(function(r){ desenhar(caixa, r, false); }, function(){ caixa.textContent = 'Não foi possível carregar a lista agora.'; });
    });
  }

  C.aoCarregar(function(d){
    if (limite && (d.acesso || d.motivo !== 'limite_aparelhos')) limite.hidden = true;
    if (meus && !d.acesso) meus.open = false;
  });
  C.mostrarLimite = mostrarLimite;

  // "Sair deste aparelho" também libera a vaga dele para outro aparelho
  C.sairDeVez = function(){
    return listar().then(function(r){
      var eu = r.aparelhos.filter(function(a){ return a.este; })[0];
      if (eu) return liberar(eu.ref);
    }).catch(function(){}).then(function(){ return C.sair(); });
  };

  // ----- Navegador de dentro do Instagram/Facebook -----
  var ua = navigator.userAgent;
  var app = /Instagram/.test(ua) ? 'do Instagram' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'do Facebook' : '';
  var secao = document.querySelector('#apoie .apoie-in');
  if (app && secao){
    var aviso = el('p', 'aviso-app');
    aviso.appendChild(document.createTextNode('Você está no navegador ' + app + '. Para seu acesso ao álbum ficar guardado, abra esta página no navegador do celular: toque em '));
    aviso.appendChild(el('b', '', '⋯'));
    aviso.appendChild(document.createTextNode(' e escolha '));
    aviso.appendChild(el('b', '', 'Abrir no navegador'));
    aviso.appendChild(document.createTextNode('.'));
    secao.insertBefore(aviso, secao.firstChild);
  }
})();
