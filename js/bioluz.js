// Barra de avanço viva: a parte já ouvida é uma correnteza que acende como plâncton bioluminescente,
// três fios de luz ondulando, uma cabeça que pulsa e faíscas que se soltam e ficam para trás.
// Usada no player do site (js/album.js), na tela da letra (js/letra.js) e na tela da TV (js/tela-tv.js).
//
//   var bio = Bioluz(9);                 // amplitude da onda em px (9 no player, 5 nas barrinhas)
//   var bio = Bioluz(14, { leve: true }); // TVs e aparelhos fracos: sem sombra borrada e com menos faíscas
//   bio.ligar(canvas); bio.cor('#A9C98A'); bio.quadro(dt, progresso0a1, tocando);
window.Bioluz = function(amplitude, opcoes){
  var leve = !!(opcoes && opcoes.leve);
  var reduzir = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canvas = null, ctx = null, w = 0, h = 0, t = 0, faiscas = [];
  var tom = [95, 242, 224];
  var obsTamanho = 'ResizeObserver' in window ? new ResizeObserver(function(){ medir(); }) : null;

  function rgb(hex){
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function cor(c, a){ return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  function medir(){
    if (!canvas) return;
    var r = canvas.getBoundingClientRect(), dpr = leve ? 1 : Math.min(2, window.devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function onda(x, fim, fase, amp){
    // os fios se juntam na cabeça e se abrem ao longo do que já passou
    var abre = Math.min(1, (fim - x) / 70) * Math.min(1, x / 24 + .2);
    return h / 2 + (Math.sin(x * .05 - fase) * .6 + Math.sin(x * .017 + fase * .55) * .4) * amp * abre;
  }

  function quadro(dt, p, tocando){
    if (!ctx || w < 2) return;
    if (reduzir) dt = 0;
    t += dt / 60;
    var fim = Math.max(0, Math.min(1, p || 0)) * w, meio = h / 2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    // o leito do rio, ainda escuro
    ctx.strokeStyle = 'rgba(169,188,203,.16)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1, meio); ctx.lineTo(w - 1, meio); ctx.stroke();
    if (fim < 1) return;

    ctx.globalCompositeOperation = 'lighter';
    [
      { amp: amplitude,       fase: t * 2.1,       c: [30, 95, 210],  a: .45, lw: 4,   brilho: 10 },
      { amp: amplitude * .7,  fase: t * 3 + 1.7,   c: [57, 200, 255], a: .7,  lw: 2,   brilho: 8 },
      { amp: amplitude * .45, fase: t * 1.5 + 3.1, c: tom,            a: .95, lw: 1.4, brilho: 6 }
    ].forEach(function(f){
      var g = ctx.createLinearGradient(0, 0, fim, 0);
      g.addColorStop(0, cor(f.c, f.a * .25));
      g.addColorStop(.7, cor(f.c, f.a * .7));
      g.addColorStop(1, cor(f.c, f.a));
      ctx.strokeStyle = g; ctx.lineWidth = f.lw;
      // o brilho borrado (shadowBlur) é o que mais pesa: no modo leve, os fios ficam um pouco mais grossos no lugar
      if (leve) ctx.lineWidth = f.lw * 1.6;
      else { ctx.shadowColor = cor(f.c, .9); ctx.shadowBlur = f.brilho; }
      ctx.beginPath();
      for (var x = 0; x <= fim; x += 3) ctx[x ? 'lineTo' : 'moveTo'](x, onda(x, fim, f.fase, f.amp));
      ctx.lineTo(fim, meio);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // faíscas: nascem na cabeça e ao longo da correnteza, derivam para trás e se apagam
    if (tocando && dt){
      var nascer = dt * (amplitude > 6 ? .9 : .5) * (leve ? .35 : 1); // menos faíscas no modo leve
      while (nascer > 0){
        if (Math.random() < nascer){
          var junto = Math.random() < .55;
          var px = junto ? fim - Math.random() * 14 : Math.random() * fim;
          faiscas.push({ x: px, y: onda(px, fim, t * 3 + 1.7, amplitude * .7) + (Math.random() - .5) * amplitude,
            vx: -(.15 + Math.random() * .6), vy: (Math.random() - .5) * .35,
            r: .6 + Math.random() * (amplitude > 6 ? 1.8 : 1.1), vida: 0, max: 30 + Math.random() * 60,
            c: Math.random() < .3 ? tom : Math.random() < .5 ? [150, 255, 240] : [80, 190, 255] });
        }
        nascer -= 1;
      }
    }
    faiscas = faiscas.filter(function(s){
      s.vida += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.vida > s.max || s.x < 0) return false;
      var a = Math.sin(Math.PI * s.vida / s.max);
      ctx.fillStyle = cor(s.c, a * .22);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, 6.29); ctx.fill();
      ctx.fillStyle = cor(s.c, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill();
      return true;
    });

    // a cabeça da correnteza, pulsando
    var pulso = 1 + (tocando ? Math.sin(t * 6) * .18 : 0), raio = (amplitude > 6 ? 11 : 7) * pulso;
    var luz = ctx.createRadialGradient(fim, meio, 0, fim, meio, raio);
    luz.addColorStop(0, 'rgba(235,255,252,.95)');
    luz.addColorStop(.3, cor(tom, .7));
    luz.addColorStop(1, cor(tom, 0));
    ctx.fillStyle = luz;
    ctx.beginPath(); ctx.arc(fim, meio, raio, 0, 6.29); ctx.fill();
  }

  return {
    ligar: function(c){
      if (canvas === c) return;
      if (canvas && obsTamanho) obsTamanho.unobserve(canvas);
      canvas = c; ctx = c ? c.getContext('2d') : null; faiscas = [];
      if (c){ medir(); if (obsTamanho) obsTamanho.observe(c); }
    },
    cor: function(hex){ tom = rgb(hex) || [95, 242, 224]; },
    quadro: quadro
  };
};
