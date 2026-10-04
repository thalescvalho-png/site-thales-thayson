// Letra sincronizada (.lrc): leitura do arquivo e "qual verso está tocando agora".
// Não mexe na página: o mesmo módulo serve a tela de letra (js/letra.js) e, depois, o modo TV.
//
//   var lrc = LetraLRC.ler(texto);             // { linhas: [{ t, texto }], meta: { ar, ti, ... } }
//   var linhas = LetraLRC.comPausas(lrc.linhas); // acrescenta "♪ ♪ ♪" nos trechos instrumentais longos
//   var relogio = LetraLRC.relogio(audio);
//   var i = LetraLRC.indice(linhas, relogio.agora()); // -1 antes do primeiro verso
(function(raiz, fabrica){
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.LetraLRC = fabrica();
})(this, function(){
  // [mm:ss], [mm:ss.x], [mm:ss.xx] ou [mm:ss.xxx] (alguns programas usam ":" no lugar do ".")
  var TEMPO = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  var META = /^\[([a-zA-Z#]+):(.*)\]$/;

  function segundos(m, s, fracao){
    return Number(m) * 60 + Number(s) + (fracao ? Number(fracao) / Math.pow(10, fracao.length) : 0);
  }

  /** Lê o texto do .lrc. Linhas sem texto (só o tempo) ficam com texto "" e marcam pausas. */
  function ler(texto){
    var meta = {}, linhas = [], ordem = 0;
    String(texto || '').replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach(function(bruta){
      var linha = bruta.trim();
      if (!linha) return;
      var m = META.exec(linha);
      if (m && !/^\d/.test(m[1])){ meta[m[1].toLowerCase()] = m[2].trim(); return; }
      var tempos = [], fim = 0, t;
      TEMPO.lastIndex = 0;
      // os tempos ficam todos no começo da linha: [00:12.00][01:40.00] refrão
      while ((t = TEMPO.exec(linha)) && t.index === fim){
        tempos.push(segundos(t[1], t[2], t[3]));
        fim = TEMPO.lastIndex;
      }
      if (!tempos.length) return;
      // tira os tempos de cada palavra do formato estendido (<00:12.34>)
      var verso = linha.slice(fim).replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
      tempos.forEach(function(s){ linhas.push({ t: s, texto: verso, ordem: ordem++ }); });
    });
    // [offset:+500] = a letra vem meio segundo antes (em milissegundos, como no padrão)
    var offset = Number(meta.offset) || 0;
    linhas.forEach(function(l){ l.t = Math.max(0, l.t - offset / 1000); });
    linhas.sort(function(a, b){ return a.t - b.t || a.ordem - b.ordem; });
    return {
      meta: meta,
      linhas: linhas.map(function(l){ return { t: l.t, texto: l.texto }; })
    };
  }

  /**
   * Trechos instrumentais: onde passam mais de `intervalo` segundos sem canto, entra uma linha
   * { pausa: true, texto: '♪ ♪ ♪' }. Uma linha vazia no .lrc marca onde o canto para; sem ela,
   * a pausa começa `depois` segundos após o último verso. Linhas vazias curtas somem.
   */
  function comPausas(linhas, opcoes){
    opcoes = opcoes || {};
    var intervalo = opcoes.intervalo || 8, depois = opcoes.depois || 6, nota = opcoes.nota || '♪ ♪ ♪';
    var saida = [];
    function pausa(t){
      if (saida.length && saida[saida.length - 1].pausa) return;
      saida.push({ t: t, texto: nota, pausa: true });
    }
    var cantadas = linhas.filter(function(l){ return l.texto; });
    if (cantadas.length && cantadas[0].t > intervalo) pausa(0);
    linhas.forEach(function(l, i){
      var proxima = linhas[i + 1];
      var folga = (proxima ? proxima.t : Infinity) - l.t;
      if (!l.texto){
        // linha vazia no começo, antes do primeiro verso: já coberta pela pausa da introdução
        if (folga > intervalo && saida.length) pausa(l.t);
        return;
      }
      saida.push({ t: l.t, texto: l.texto });
      if (proxima && proxima.texto && folga > intervalo) pausa(l.t + depois);
    });
    return saida;
  }

  /** Posição do verso que está tocando no tempo t (busca binária); -1 antes do primeiro. */
  function indice(linhas, t){
    var baixo = 0, alto = linhas.length - 1, achado = -1;
    while (baixo <= alto){
      var meio = (baixo + alto) >> 1;
      if (linhas[meio].t <= t){ achado = meio; baixo = meio + 1; } else alto = meio - 1;
    }
    return achado;
  }

  /**
   * Tempo do áudio a cada quadro. Alguns navegadores só atualizam o currentTime algumas vezes
   * por segundo; entre uma atualização e outra o relógio estima o tempo pelo relógio do aparelho.
   */
  function relogio(midia){
    var base = 0, quando = 0;
    return {
      agora: function(){
        var t = midia.currentTime || 0, ms = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (midia.paused || midia.seeking || midia.readyState < 3 || t !== base){ base = t; quando = ms; return t; }
        return base + Math.min(.5, (ms - quando) / 1000 * (midia.playbackRate || 1));
      }
    };
  }

  return { ler: ler, comPausas: comPausas, indice: indice, relogio: relogio };
});
