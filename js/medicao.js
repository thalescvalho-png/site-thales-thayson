// Medição sem cookies, usada em todas as páginas.
// 1. Guarda de onde a pessoa chegou (links com ?origem=stories ou ?utm_source=instagram&utm_medium=bio)
//    por 30 dias, só neste navegador, para saber de onde vêm as prévias e as vendas.
// 2. Carrega o Cloudflare Web Analytics (visitas e páginas, sem cookies) quando houver o token abaixo.
// 3. window.Medicao.evento('previa') soma +1 numa etapa do funil, sem nada que identifique a pessoa.
(function(){
  // Cloudflare → Web Analytics → Add a site → copie o "token" do código que aparece e cole aqui.
  var TOKEN_WEB_ANALYTICS = '';

  var meta = document.querySelector('meta[name="correnteza-api"]');
  var API = ((meta && meta.content) || 'https://correnteza.correnteza-backend.workers.dev').replace(/\/$/, '');
  // testando no próprio computador: usa o backend local (npm run dev, na pasta backend)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API = 'http://localhost:8787';

  var CHAVE = 'correnteza.origem';
  var TRINTA_DIAS = 30 * 86400000;

  function limpar(t){ return String(t || '').toLowerCase().replace(/[^a-z0-9._\/-]/g, '').slice(0, 40); }
  function ler(){ try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } }
  function gravar(origem){ try { localStorage.setItem(CHAVE, JSON.stringify({ origem: origem, ate: Date.now() + TRINTA_DIAS })); } catch (e) {} }

  function daVisita(){
    var p = new URLSearchParams(location.search);
    var marcada = p.get('origem') || (p.get('utm_source') ? p.get('utm_source') + (p.get('utm_medium') ? '/' + p.get('utm_medium') : '') : '');
    if (marcada) return limpar(marcada);
    if (/Instagram/.test(navigator.userAgent)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/.test(navigator.userAgent)) return 'facebook';
    if (!document.referrer) return '';
    var host = '';
    try { host = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    if (host === location.hostname) return '';
    if (/instagram/.test(host)) return 'instagram';
    if (/facebook|fb\.me/.test(host)) return 'facebook';
    if (/whatsapp|wa\.me/.test(host)) return 'whatsapp';
    if (/youtube|youtu\.be/.test(host)) return 'youtube';
    if (/(^|\.)google\./.test(host)) return 'google';
    if (/^t\.co$|twitter|x\.com/.test(host)) return 'x';
    return limpar(host);
  }

  // a última origem marcada vale por 30 dias; sem marcação nova, continua a anterior
  var nova = daVisita();
  if (nova) gravar(nova);
  var salva = ler();
  var origem = salva && salva.ate > Date.now() ? salva.origem : 'direto';

  var enviados = {};
  window.Medicao = {
    api: API,
    origem: function(){ return origem; },
    // uma vez por página para cada etapa: recarregar não infla a contagem
    evento: function(nome){
      if (enviados[nome]) return;
      enviados[nome] = true;
      var corpo = JSON.stringify({ evento: nome, origem: origem });
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(API + '/api/evento', corpo)) return;
      } catch (e) {}
      try { fetch(API + '/api/evento', { method: 'POST', body: corpo, keepalive: true, mode: 'cors' }).catch(function(){}); } catch (e) {}
    }
  };

  if (TOKEN_WEB_ANALYTICS){
    var s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN_WEB_ANALYTICS }));
    document.head.appendChild(s);
  }
})();
