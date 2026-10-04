// Ouvir o álbum na TV, pela página do álbum (correnteza.html). Só para quem tem o código de acesso.
//
//  - Google Cast (Chrome no Android e no computador): o ícone oficial aparece no player só se houver
//    um Chromecast ou Google TV na rede. O álbum vai inteiro como fila; a TV mostra a tela padrão do
//    Google (capa e título) e a letra sincronizada aparece aqui no celular.
//  - AirPlay (Safari no iPhone): o ícone aparece no lugar do Cast; o som vai do próprio player para a
//    Apple TV ou TV com AirPlay, que mostra a capa e o título (Media Session, em js/album.js).
//  - Modo TV (qualquer TV com navegador): a TV abre /tv e mostra um código; aqui a pessoa confirma e o
//    celular vira o controle remoto. A TV mostra a capa, a letra sincronizada e a barra do álbum.
// Nos três casos o celular abre o painel "Na TV": a mesma tela da TV (js/tela-tv.js), compacta,
// com a barra do álbum inteiro (tocar num trecho pula para a faixa, arrastar adianta ou volta).
(function(){
  var C = window.Correnteza, P = C && C.player;
  if (!P || !window.TelaTV) return;

  // ===== AJUSTES =====
  // FASE 2 (receptor próprio, US$ 5 no console do Google Cast): troque só este ID pelo do seu receptor.
  // 'CC1AD845' é o receptor padrão do Google (gratuito, sem cadastro): mostra capa e título, sem letra.
  var CAST_APP_ID = 'CC1AD845';
  var CONFERIR_VEZ_MS = 20000;      // durante o Cast, confere a cada 20 s se outro aparelho pegou a vez
  var PAUSA_LONGA_MS = 10 * 60000;  // Cast pausado por mais que isso: ao voltar, pede links novos

  function $(id){ return document.getElementById(id); }
  var audio = P.audio;
  var CAPA = new URL('img/tv/capa-1024.jpg', location.href).href; // o Chromecast precisa do endereço completo
  // o endereço da TV (meta "tv-endereco" no topo de correnteza.html) aparece no passo a passo
  var endereco = (document.querySelector('meta[name="tv-endereco"]') || {}).content;
  if (endereco) [].forEach.call(document.querySelectorAll('[data-tv-endereco]'), function(e){ e.textContent = endereco; });
  var iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ===================================================================
  // Painel "Na TV" (o controle remoto, com a mesma tela da TV em versão compacta)
  // ===================================================================
  var painel = $('naTv'), destino = null, tela = null, letrasPedidas = false;
  var btTocarTv = $('naTvTocar'), tocandoAntes = false;

  function dadosAlbum(){
    var d = C.dados() || {};
    return {
      titulo: d.album || 'Correnteza', artistas: d.artistas || 'Thales Carvalho & Thayson Azevedo',
      faixas: P.faixas().map(function(f, i){
        return { numero: f.numero, titulo: f.titulo, idioma: f.idioma, tom: P.tom(i), duracao: f.duracao || 0, linhas: null };
      })
    };
  }

  function prepararTela(){
    if (!tela){
      tela = TelaTV.criar($('naTvTela'), {
        compacta: true, capa: 'img/tv/capa-512.jpg', fundo: 'img/tv/capa-fundo.jpg',
        aoPular: function(i){ if (destino) destino.ir(i, 0); },
        aoBuscar: function(i, t){ if (destino) destino.ir(i, t); }
      });
    }
    tela.album(dadosAlbum());
    // letras (.lrc) e durações que ainda faltam
    if (!letrasPedidas && C.letraDe){
      letrasPedidas = true;
      P.faixas().forEach(function(f, i){
        C.letraDe(i).then(function(ls){ tela.letra(i, ls && ls.length ? ls : null); }, function(){});
      });
    }
    P.faixas().forEach(function(f, i){
      if (f.duracao || !f.audio) return;
      var sonda = new Audio(); sonda.preload = 'metadata'; sonda.src = f.audio;
      sonda.addEventListener('loadedmetadata', function(){ f.duracao = sonda.duration; if (tela) tela.duracao(i, sonda.duration); sonda.removeAttribute('src'); });
    });
  }
  C.aoCarregar(function(){ letrasPedidas = false; if (tela && destino) prepararTela(); });

  function abrirPainel(d){
    destino = d;
    prepararTela();
    $('naTvTitulo').textContent = d.nome;
    painel.hidden = false;
    document.documentElement.classList.add('na-tv-aberto');
    document.body.classList.add('na-tv');
    requestAnimationFrame(function(){ painel.classList.add('aberto'); });
  }
  // só esconde: a TV continua tocando e o botão de TV no player reabre o painel
  function esconderPainel(){
    painel.classList.remove('aberto');
    painel.hidden = true;
    document.documentElement.classList.remove('na-tv-aberto');
  }
  function encerrarPainel(texto){
    destino = null;
    esconderPainel();
    document.body.classList.remove('na-tv');
    if (texto) avisoPlayer(texto);
  }
  function avisoPlayer(texto){
    var sub = $('tocadorSub');
    if (!sub) return;
    sub.textContent = texto;
    $('tocador').classList.add('avisando');
  }
  function estado(i, t, tocando){
    if (!tela) return;
    if (tocando && !tocandoAntes) tela.aviso(''); // voltou a tocar: some o aviso de "pausado"
    tocandoAntes = tocando;
    tela.posicao(i, t, tocando);
    btTocarTv.innerHTML = tocando ? '&#10074;&#10074;' : '&#9654;&#xFE0E;';
    btTocarTv.setAttribute('aria-label', tocando ? 'Pausar na TV' : 'Tocar na TV');
  }

  $('naTvFechar').addEventListener('click', esconderPainel);
  $('naTvSair').addEventListener('click', function(){ if (destino) destino.sair(); });
  btTocarTv.addEventListener('click', function(){ if (destino) destino.alternar(); });
  $('naTvAnterior').addEventListener('click', function(){ if (destino) destino.anterior(); });
  $('naTvProxima').addEventListener('click', function(){ if (destino) destino.proxima(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !painel.hidden) esconderPainel(); });

  // ===================================================================
  // 1. Modo TV: a TV abre /tv e o celular confirma o código
  // ===================================================================
  var janela = $('tvConectar'), form = $('formTv'), campo = $('campoTv'), msg = $('msgTv');
  var ws = null, salaTv = null, pingTv = 0, quedas = 0;

  function mensagem(t){ msg.textContent = t || ''; msg.hidden = !t; }
  function abrirConectar(codigo){
    if (destino && destino.tipo === 'tv'){ abrirPainel(destino); return; }
    janela.hidden = false;
    var temAcesso = P.completo();
    form.hidden = !temAcesso;
    $('tvSemAcesso').hidden = temAcesso;
    if (codigo) campo.value = codigo.slice(0, 3) + ' ' + codigo.slice(3);
    mensagem('');
    requestAnimationFrame(function(){ janela.classList.add('aberto'); if (temAcesso) campo.focus(); });
  }
  function fecharConectar(){ janela.classList.remove('aberto'); janela.hidden = true; }
  $('tvConectarFechar').addEventListener('click', fecharConectar);
  [].forEach.call(document.querySelectorAll('[data-assistir-tv]'), function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); abrirConectar(); });
  });
  $('tvSemAcesso').querySelector('a').addEventListener('click', fecharConectar);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var codigo = campo.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (codigo.length !== 6){ mensagem('O código da TV tem 6 letras e números.'); campo.focus(); return; }
    mensagem('');
    var botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    var corpo = C.credenciais(); corpo.tv = codigo;
    C.pedirJson('/api/tv/parear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(function(r){
      botao.disabled = false;
      if (!r.ok){ mensagem(r.mensagem || 'Não deu para conectar agora. Tente de novo.'); return; }
      fecharConectar();
      C.gravar('correnteza.tvSala', r.sala);
      conectarTv(r.sala, true);
      C.evento('tv_conectada');
    }, function(){ botao.disabled = false; mensagem('Sem conexão agora. Verifique a internet e tente de novo.'); });
  });

  function enviarTv(m){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function comandoTv(acao, extra){
    var m = { tipo: 'comando', acao: acao };
    if (extra) for (var k in extra) m[k] = extra[k];
    enviarTv(m);
  }

  var destinoTv = {
    tipo: 'tv', nome: 'Tocando na TV',
    alternar: function(){ comandoTv('alternar'); },
    anterior: function(){ comandoTv('anterior'); },
    proxima: function(){ comandoTv('proxima'); },
    ir: function(i, t){ comandoTv('ir', { faixa: i, t: t }); },
    sair: function(){ enviarTv({ tipo: 'desconectar' }); esquecerTv('TV desconectada.'); }
  };

  function conectarTv(sala, novo){
    salaTv = sala;
    if (ws){ try { ws.onclose = null; ws.close(); } catch (e) {} }
    var url = C.api.replace(/^http/, 'ws') + '/api/tv/ws?sala=' + encodeURIComponent(sala) + C.consulta().replace(/^\?/, '&');
    ws = new WebSocket(url);
    var abriu = false;
    ws.onopen = function(){
      abriu = true; quedas = 0;
      clearInterval(pingTv);
      pingTv = setInterval(function(){ enviarTv({ tipo: 'ping' }); }, 25000);
      if (novo){
        // a TV começa de onde o celular estava, e o celular para de tocar
        novo = false;
        var tocava = !audio.paused;
        audio.pause();
        comandoTv('ir', { faixa: Math.max(0, P.atual()), t: tocava || audio.currentTime > 1 ? audio.currentTime : 0 });
      }
      abrirPainel(destinoTv);
    };
    ws.onmessage = function(e){
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.tipo === 'estado'){
        $('naTvTitulo').textContent = m.tv ? 'Tocando na TV' : 'TV sem conexão';
        var t = m.t + (m.tocando ? Math.max(0, (m.agora - m.quando) / 1000) : 0);
        estado(m.faixa, t, m.tocando);
      } else if (m.tipo === 'aviso' && tela) tela.aviso(m.texto);
      else if (m.tipo === 'fim') esquecerTv(m.motivo === 'expirou' ? 'A TV ficou um tempo parada e foi desconectada.' : 'TV desconectada.');
    };
    ws.onclose = function(){
      clearInterval(pingTv);
      if (!salaTv) return;
      // a sala recusou (TV desconectada enquanto o celular dormia): esquece; senão, reconecta
      if (!abriu && ++quedas >= 3){ esquecerTv(''); return; }
      setTimeout(function(){ if (salaTv) conectarTv(salaTv, false); }, Math.min(20000, 1500 * Math.pow(2, quedas)));
    };
  }
  function esquecerTv(texto){
    salaTv = null;
    C.gravar('correnteza.tvSala', null);
    clearInterval(pingTv);
    if (ws){ try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
    if (destino && destino.tipo === 'tv') encerrarPainel(texto);
  }

  // QR code da TV: correnteza.html?tv=K7Q4MD (o código sai do endereço)
  var params = new URLSearchParams(location.search), pedidoTv = (params.get('tv') || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (params.has('tv')){
    params.delete('tv');
    var resto = params.toString();
    history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
  }
  C.aoCarregar(function(d){
    document.body.classList.toggle('pode-tv', !!d.acesso);
    if (pedidoTv){ var c = pedidoTv; pedidoTv = ''; abrirConectar(c); }
    // voltou à página com uma TV conectada: reconecta como controle
    var guardada = C.ler('correnteza.tvSala');
    if (d.acesso && guardada && !salaTv) conectarTv(guardada, false);
    if (!d.acesso && salaTv) esquecerTv('');
  });

  // ===================================================================
  // 2. AirPlay (Safari no iPhone, iPad e Mac)
  // ===================================================================
  var btAirplay = $('btAirplay');
  if (window.WebKitPlaybackTargetAvailabilityEvent && audio.webkitShowPlaybackTargetPicker){
    audio.setAttribute('x-webkit-airplay', 'allow');
    audio.addEventListener('webkitplaybacktargetavailabilitychanged', function(e){
      btAirplay.hidden = e.availability !== 'available';
    });
    btAirplay.addEventListener('click', function(){ audio.webkitShowPlaybackTargetPicker(); });

    var destinoAirplay = {
      tipo: 'airplay', nome: 'Tocando pela AirPlay',
      alternar: function(){ P.alternar(); },
      anterior: function(){ P.anterior(); },
      proxima: function(){ P.proxima(); },
      ir: function(i, t){
        if (i !== P.atual()){
          P.tocarFaixa(i);
          if (t > 0) audio.addEventListener('loadedmetadata', function pular(){ audio.removeEventListener('loadedmetadata', pular); audio.currentTime = t; });
        } else { audio.currentTime = t; if (audio.paused) P.alternar(); }
      },
      // o seletor da AirPlay é o único jeito de voltar o som para o iPhone
      sair: function(){ audio.webkitShowPlaybackTargetPicker(); }
    };
    function airplayAgora(){
      if (destino && destino.tipo === 'airplay') estado(Math.max(0, P.atual()), audio.currentTime || 0, !audio.paused);
    }
    audio.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', function(){
      if (audio.webkitCurrentPlaybackTargetIsWireless){ abrirPainel(destinoAirplay); airplayAgora(); }
      else if (destino && destino.tipo === 'airplay') encerrarPainel('');
    });
    ['play', 'pause', 'seeked', 'loadedmetadata'].forEach(function(n){ audio.addEventListener(n, airplayAgora); });
    var ultimaAir = 0;
    audio.addEventListener('timeupdate', function(){ if (Date.now() - ultimaAir > 4000){ ultimaAir = Date.now(); airplayAgora(); } });
    P.aoTrocar(function(){ airplayAgora(); });
  }

  // ===================================================================
  // 3. Google Cast (Chrome no Android e no computador)
  // ===================================================================
  var lancador = $('castBotao');
  var chrome_ = !!window.chrome && !iOS && !/Edg\/|OPR\/|SamsungBrowser/.test(navigator.userAgent);
  if (chrome_ && lancador){
    window.__onGCastApiAvailable = function(disponivel){ if (disponivel) iniciarCast(); };
    C.aoCarregar(function(d){
      if (!d.acesso || document.getElementById('sdkCast')) return;
      var s = document.createElement('script');
      s.id = 'sdkCast';
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      document.head.appendChild(s);
    });
  }

  function iniciarCast(){
    var cf = window.cast.framework, cc = window.chrome.cast;
    var contexto = cf.CastContext.getInstance();
    contexto.setOptions({ receiverApplicationId: CAST_APP_ID, autoJoinPolicy: cc.AutoJoinPolicy.ORIGIN_SCOPED });
    var jogador = new cf.RemotePlayer(), controle = new cf.RemotePlayerController(jogador);
    var pausadoDesde = 0, ultimaRecarga = 0, ultimaVez = 0, faixaCast = 0;

    // o ícone só aparece se houver um aparelho Cast na rede (e só para quem tem o álbum)
    // Um ícone de transmitir só: com um aparelho Cast na rede, aparece o botão oficial do Google;
    // sem nenhum, o mesmo desenho abre o "Ouça na TV" (Modo TV). Com uma TV já conectada, os dois aparecem.
    function mostrarIcone(){
      var semCast = contexto.getCastState() === cf.CastState.NO_DEVICES_AVAILABLE;
      lancador.hidden = semCast;
      $('btTv').hidden = !semCast && !(destino && destino.tipo === 'tv');
      $('btUsarCast').hidden = semCast;
    }
    $('btUsarCast').addEventListener('click', function(){ fecharConectar(); contexto.requestSession().catch(function(){}); });
    contexto.addEventListener(cf.CastContextEventType.CAST_STATE_CHANGED, mostrarIcone);
    mostrarIcone();

    function sessao(){ return contexto.getCurrentSession(); }
    function midia(){ var s = sessao(); return s && s.getMediaSession(); }

    // a fila inteira, começando na faixa i, segundo t (links novos a cada carga)
    function carregarFila(i, t){
      ultimaRecarga = Date.now();
      return C.pedirJson('/api/cast/fila' + C.consulta() + '&inicio=' + i, { cache: 'no-store' }).then(function(r){
        if (!r.faixas) throw new Error(r.erro || 'fila');
        var faixas = P.faixas(), d = C.dados() || {};
        var itens = faixas.map(function(f, k){
          var info = new cc.media.MediaInfo(r.faixas[k].audio, 'audio/mpeg');
          info.streamType = cc.media.StreamType.BUFFERED;
          var meta = new cc.media.MusicTrackMediaMetadata();
          meta.title = f.titulo;
          meta.albumName = d.album || 'Correnteza';
          meta.artist = meta.albumArtist = d.artistas || 'Thales Carvalho & Thayson Azevedo';
          meta.trackNumber = f.numero;
          meta.images = [new cc.Image(CAPA)];
          info.metadata = meta;
          info.customData = { faixa: k };
          var item = new cc.media.QueueItem(info);
          item.autoplay = true;
          item.preloadTime = 20;
          if (k === i && t > 0) item.startTime = t;
          return item;
        });
        var pedido = new cc.media.LoadRequest(itens[i].media);
        pedido.autoplay = true;
        if (t > 0) pedido.currentTime = t;
        pedido.queueData = new cc.media.QueueData(undefined, d.album || 'Correnteza', undefined, cc.media.RepeatMode.OFF, itens, i, t > 0 ? t : undefined);
        if (cc.media.QueueType) pedido.queueData.queueType = cc.media.QueueType.ALBUM;
        return sessao().loadMedia(pedido).catch(function(){
          // plano B: o comando antigo de fila (queueLoad), que o receptor padrão também entende
          return new Promise(function(ok, falha){
            var fila = new cc.media.QueueLoadRequest(itens);
            fila.startIndex = i;
            fila.repeatMode = cc.media.RepeatMode.OFF;
            sessao().getSessionObj().queueLoad(fila, ok, falha);
          });
        });
      }).catch(function(){ if (tela) tela.aviso('Não deu para mandar o álbum para a TV. Tente de novo.'); });
    }

    function faixaAtualCast(){
      var info = jogador.mediaInfo;
      if (info && info.customData && info.customData.faixa >= 0) return info.customData.faixa;
      var n = info && info.metadata && info.metadata.trackNumber;
      var k = P.faixas().map(function(f){ return f.numero; }).indexOf(n);
      return k >= 0 ? k : faixaCast;
    }
    function atualizar(){
      if (!destino || destino.tipo !== 'cast' || !jogador.isMediaLoaded) return;
      faixaCast = faixaAtualCast();
      var tocando = !jogador.isPaused && jogador.playerState !== 'IDLE';
      if (jogador.isPaused){ if (!pausadoDesde) pausadoDesde = Date.now(); } else pausadoDesde = 0;
      estado(faixaCast, jogador.currentTime || 0, tocando);
      if (tocando) vez();
    }

    // uma reprodução por vez: a vez fica com este celular enquanto ele manda para a TV
    function vez(){
      if (Date.now() - ultimaVez < CONFERIR_VEZ_MS) return;
      var primeira = !ultimaVez;
      ultimaVez = Date.now();
      if (primeira){
        C.pedirJson('/api/tocando', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C.credenciais()) }).catch(function(){});
        return;
      }
      C.pedirJson('/api/tocando' + C.consulta(), { cache: 'no-store' }).then(function(r){
        if (r.meu === false && !jogador.isPaused){
          controle.playOrPause();
          if (tela) tela.aviso('Pausado: começou a tocar em outro aparelho (' + (r.outro || 'sem nome') + ').');
        }
      }, function(){});
    }

    var destinoCast = {
      tipo: 'cast', nome: 'Tocando no Chromecast',
      alternar: function(){
        // pausa longa: os links da fila podem ter vencido; manda a fila de novo de onde parou
        if (jogador.isPaused && pausadoDesde && Date.now() - pausadoDesde > PAUSA_LONGA_MS){
          pausadoDesde = 0; carregarFila(faixaCast, jogador.currentTime || 0); return;
        }
        if (jogador.isPaused) ultimaVez = 0; // voltou a tocar: pega a vez de novo
        controle.playOrPause();
      },
      anterior: function(){
        var m = midia();
        if ((jogador.currentTime || 0) > 3 || faixaCast === 0){ jogador.currentTime = 0; controle.seek(); return; }
        if (m) m.queuePrev(function(){}, function(){ carregarFila(Math.max(0, faixaCast - 1), 0); });
      },
      proxima: function(){
        var m = midia();
        if (faixaCast >= P.faixas().length - 1) return;
        if (m) m.queueNext(function(){}, function(){ carregarFila(faixaCast + 1, 0); });
      },
      ir: function(i, t){
        if (i === faixaCast && jogador.isMediaLoaded){ jogador.currentTime = t; controle.seek(); }
        else carregarFila(i, t);
      },
      sair: function(){ var s = sessao(); if (s) s.endSession(true); }
    };

    controle.addEventListener(cf.RemotePlayerEventType.ANY_CHANGE, function(e){
      if (e.field === 'currentTime' || e.field === 'isPaused' || e.field === 'mediaInfo' || e.field === 'playerState' || e.field === 'isMediaLoaded') atualizar();
    });
    // a faixa falhou na TV (link vencido): manda a fila de novo de onde estava, no máximo 1 vez por minuto
    controle.addEventListener(cf.RemotePlayerEventType.PLAYER_STATE_CHANGED, function(){
      var m = midia();
      if (jogador.playerState === 'IDLE' && m && m.idleReason === 'ERROR' && Date.now() - ultimaRecarga > 60000) carregarFila(faixaCast, jogador.currentTime || 0);
    });

    contexto.addEventListener(cf.CastContextEventType.SESSION_STATE_CHANGED, function(e){
      var S = cf.SessionState;
      if (e.sessionState === S.SESSION_STARTED){
        // começou agora: a TV pega o álbum de onde o celular estava, e o celular para
        var i = Math.max(0, P.atual()), t = audio.currentTime > 1 ? audio.currentTime : 0;
        audio.pause();
        ultimaVez = 0;
        abrirPainel(destinoCast);
        carregarFila(i, t);
        C.evento('cast');
      } else if (e.sessionState === S.SESSION_RESUMED){
        abrirPainel(destinoCast);
        atualizar();
      } else if (e.sessionState === S.SESSION_ENDED){
        if (destino && destino.tipo === 'cast') encerrarPainel('');
      }
    });
  }

  // botão de TV no player: abre o painel se já houver uma TV; senão, o "Ouça na TV"
  $('btTv').addEventListener('click', function(){ if (destino) abrirPainel(destino); else abrirConectar(); });
})();
