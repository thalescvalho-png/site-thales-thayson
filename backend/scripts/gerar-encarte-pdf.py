#!/usr/bin/env python3
"""
Gera o Correnteza-Encarte.pdf a partir do encarte.json.

Uso (no Terminal, dentro da pasta backend):
    python3 scripts/gerar-encarte-pdf.py                # usa o desenho salvo
    python3 scripts/gerar-encarte-pdf.py --nova-linha   # redesenha rio e montanhas

Lê    correnteza-privado/encarte/encarte.json          (letras e créditos)
      correnteza-privado/encarte/capa.jpg              (capa; se faltar, usa a do site)
      correnteza-privado/encarte/linha-correnteza.svg  (rio e montanhas; criado na 1ª vez)
Grava correnteza-privado/encarte/Correnteza-Encarte.pdf

A pasta correnteza-privado fica AO LADO da pasta do site, nunca dentro dela,
para que letras e PDF não acabem publicados no GitHub.
Precisa do Google Chrome instalado (é ele que "imprime" o PDF) e de internet
(as fontes vêm do Google Fonts, como no site).
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import encarte_desenho as desenho

SITE = Path(__file__).resolve().parents[2]
PRIVADO = Path(os.environ.get("CORRENTEZA_PRIVADO", SITE.parent / "correnteza-privado"))
PASTA = PRIVADO / "encarte"
ENCARTE_JSON = PASTA / "encarte.json"
CAPA = PASTA / "capa.jpg"
CAPA_SITE = SITE / "img" / "sem-ano_capa-album_correnteza.webp"
LINHA_SVG = PASTA / "linha-correnteza.svg"
SAIDA = PASTA / "Correnteza-Encarte.pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Mesmas fontes e cores do site (css/estilo.css)
FONTES = ("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500"
          "&family=Work+Sans:wght@400;500;600&display=block")

CSS = """
:root{
  --noite:#0E1826; --serra:#13223A; --vale:#1A2D45; --aco:#3E5C76;
  --nevoa:#A9BCCB; --neblina:#E7ECEE; --texto-suave:#B9C8D3; --ambar:#C68B3E;
  --serif:'Cormorant Garamond', Georgia, serif;
  --sans:'Work Sans', 'Helvetica Neue', Arial, sans-serif;
}
@page{ size:210mm 210mm; margin:0; }
*{ box-sizing:border-box; margin:0; padding:0; }
html,body{ background:var(--noite); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body{ font-family:var(--sans); color:var(--neblina); }
.folha{ position:relative; width:210mm; height:210mm; overflow:hidden; background:var(--noite); break-after:page; }
.folha:last-child{ break-after:auto; }
.arte{ position:absolute; inset:0; width:100%; height:100%; z-index:0; }
.conteudo, .rodape, .titulo{ z-index:1; }
.rodape{ position:absolute; left:20mm; right:20mm; bottom:11mm; display:flex; justify-content:space-between;
  font-size:7pt; letter-spacing:.08em; text-transform:uppercase; color:var(--nevoa); opacity:.75; }

/* capa */
.capa{ background:#0b121c url("{capa}") center/cover no-repeat; }
.capa .titulo{ position:absolute; top:15mm; right:16mm; text-align:right; }
.capa h1{ font-family:var(--serif); font-weight:500; font-size:40pt; line-height:1; color:var(--neblina); }
.capa .artistas{ margin-top:3mm; font-size:7.5pt; letter-spacing:.22em; text-transform:uppercase; color:var(--nevoa); }

/* abertura com a lista de faixas */
.abertura{ background:radial-gradient(120mm 120mm at 100% 0%, rgba(198,139,62,.22), transparent 70%),
                      linear-gradient(170deg, var(--serra), var(--noite) 60%); }
.abertura .conteudo{ position:absolute; inset:20mm 20mm 24mm; display:grid; grid-template-columns:1fr 1fr; gap:12mm; }
.rotulo{ font-family:var(--serif); font-style:italic; font-size:13pt; color:var(--ambar); }
.abertura h2{ font-family:var(--serif); font-weight:500; font-size:44pt; line-height:1; margin:2mm 0 4mm; }
.verso-album{ font-family:var(--serif); font-style:italic; font-size:14pt; color:var(--nevoa); margin-bottom:6mm; }
.descricao{ font-size:8.6pt; line-height:1.65; color:var(--texto-suave); }
.lista{ list-style:none; align-self:end; }
.lista li{ display:flex; align-items:baseline; gap:3mm; padding:2.1mm 0; border-bottom:.3pt solid rgba(169,188,203,.25); }
.lista .n{ font-family:var(--serif); font-size:12pt; color:var(--ambar); width:7mm; }
.lista .t{ font-family:var(--serif); font-size:14pt; flex:1; }
.lista .p{ font-size:7pt; color:var(--nevoa); }

/* uma página por faixa */
.faixa{ background:
    radial-gradient(95mm 95mm at 92% 4%, color-mix(in srgb, var(--tom) 42%, transparent), transparent 72%),
    linear-gradient(160deg, color-mix(in srgb, var(--tom2) 34%, var(--noite)), var(--noite) 58%); }
.faixa .conteudo{ position:absolute; inset:18mm 20mm 20mm; display:flex; flex-direction:column; }
.faixa header{ display:flex; align-items:baseline; gap:4mm; }
.faixa .num{ font-family:var(--serif); font-size:22pt; color:var(--tom); }
.faixa h2{ font-family:var(--serif); font-weight:500; font-size:30pt; line-height:1.05; }
.onda{ display:block; width:100%; height:4mm; margin:2.5mm 0 2mm; }
.onda path{ fill:none; stroke:var(--tom); stroke-width:1.2; opacity:.85; }
.creditos{ font-size:7.8pt; letter-spacing:.02em; color:var(--nevoa); margin-bottom:6mm; }
.creditos b{ font-weight:500; color:var(--texto-suave); }
.letra{ flex:1; min-height:0; overflow:hidden; font-family:var(--serif); font-size:var(--corpo, 13pt);
  line-height:1.42; color:var(--neblina); column-gap:10mm; column-fill:balance; }
.letra.duas{ column-count:2; }
.estrofe{ margin-bottom:.85em; break-inside:avoid; }
.estrofe span{ display:block; padding-left:1.1em; text-indent:-1.1em; }
.estrofe:first-child span:first-child::first-letter{ color:var(--tom); }

/* ficha técnica */
.ficha{ background:radial-gradient(120mm 120mm at 0% 100%, rgba(62,92,118,.45), transparent 70%), var(--noite); }
.ficha .conteudo{ position:absolute; inset:20mm 20mm 26mm; display:flex; flex-direction:column; }
.ficha h2{ font-family:var(--serif); font-weight:500; font-size:32pt; margin:1mm 0 8mm; }
.ficha dl{ display:grid; grid-template-columns:1fr 1fr; gap:5.2mm 10mm; }
.ficha dt{ font-size:7pt; letter-spacing:.06em; text-transform:uppercase; color:var(--nevoa); }
.ficha dd{ margin-top:1mm; font-family:var(--serif); font-size:13pt; line-height:1.2; }
.ficha .fim{ margin-top:auto; display:flex; align-items:center; gap:5mm; }
.ficha .fim img{ width:18mm; height:18mm; border-radius:1mm; object-fit:cover; }
.ficha .fim p{ font-family:var(--serif); font-size:12pt; line-height:1.3; }
.ficha .fim small{ display:block; font-family:var(--sans); font-size:7pt; letter-spacing:.14em; text-transform:uppercase; color:var(--nevoa); }
"""

# Ajusta cada letra para caber na página: diminui a fonte e, se preciso, usa duas colunas.
# Na passada de medição, também anota onde ficou cada texto (em mm) para o rio desviar dele.
AJUSTE = """
function medir(){
  var todas = [];
  document.querySelectorAll('.folha').forEach(function(folha){
    var f = folha.getBoundingClientRect(), mm = 210 / f.width, lista = [];
    function anota(r, tipo){
      if (r.width < 0.5 || r.height < 0.5) return;
      lista.push([(r.left - f.left) * mm, (r.top - f.top) * mm, (r.right - f.left) * mm, (r.bottom - f.top) * mm]
        .map(function(v){ return Math.round(v * 10) / 10; }).concat([tipo]));
    }
    function textos(el, tipo){
      var faixa = document.createRange(), andar = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), no;
      while ((no = andar.nextNode())){
        if (!no.textContent.trim()) continue;
        faixa.selectNodeContents(no);
        [].forEach.call(faixa.getClientRects(), function(r){ anota(r, tipo); });
      }
    }
    folha.querySelectorAll('.conteudo, .titulo').forEach(function(el){ textos(el, 'texto'); });
    folha.querySelectorAll('.onda, .lista li, .fim img').forEach(function(el){ anota(el.getBoundingClientRect(), 'texto'); });
    folha.querySelectorAll('.rodape').forEach(function(el){ textos(el, 'rodape'); });
    todas.push(lista);
  });
  document.getElementById('medidas').textContent = JSON.stringify(todas);
}
document.fonts.ready.then(function(){
  document.querySelectorAll('.letra').forEach(function(el){
    function cabe(){ return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1; }
    var tentativas = [[1,14],[1,13.5],[1,13],[1,12.5],[1,12],[2,13],[2,12.5],[2,12],[2,11.5],[2,11],[2,10.5],[2,10],[2,9.5]];
    for (var i = 0; i < tentativas.length; i++){
      el.classList.toggle('duas', tentativas[i][0] === 2);
      el.style.setProperty('--corpo', tentativas[i][1] + 'pt');
      if (cabe()) return;
    }
    el.insertAdjacentHTML('beforebegin', '<p style="color:#ff5a5a;font:600 9pt sans-serif">ATENÇÃO: esta letra não coube inteira na página.</p>');
  });
  if (document.getElementById('medidas')) medir();
});
"""

ONDA = ('<svg class="onda" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">'
        '<path d="M0 6 Q25 1 50 6 T100 6 T150 6 T200 6 T250 6 T300 6 T350 6 T400 6"/></svg>')


def e(texto):
    return html.escape(texto, quote=True)


def titulos_das_paginas(dados):
    return (["Capa", "Abertura"]
            + [f'{f["numero"]:02d} {f["titulo"]}' for f in dados["faixas"]]
            + ["Ficha técnica"])


def montar_html(dados, capa_url, artes=None, medir=False):
    faixas = dados["faixas"]
    artistas = e(dados["artistas"])
    artes = artes or [""] * (len(faixas) + 3)
    folhas = []

    folhas.append(f'''<section class="folha capa">
  {artes[0]}
  <div class="titulo"><h1>{e(dados["album"])}</h1><p class="artistas">{artistas}</p></div>
</section>''')

    itens = "\n".join(
        f'<li><span class="n">{f["numero"]:02d}</span><span class="t">{e(f["titulo"])}</span>'
        f'<span class="p">p. {i + 3}</span></li>' for i, f in enumerate(faixas))
    folhas.append(f'''<section class="folha abertura">
  {artes[1]}
  <div class="conteudo">
    <div>
      <p class="rotulo">Encarte</p>
      <h2>{e(dados["album"])}</h2>
      <p class="verso-album">Vem em mim, correnteza</p>
      <p class="descricao">{e(dados["descricao"])}</p>
    </div>
    <ol class="lista">{itens}</ol>
  </div>
  <div class="rodape"><span>{artistas}</span><span>2</span></div>
</section>''')

    for i, f in enumerate(faixas):
        estrofes = "\n".join(
            '<p class="estrofe">' + "".join(f"<span>{e(v)}</span>" for v in estrofe) + "</p>"
            for estrofe in f["letra"])
        c = f["creditos"]
        folhas.append(f'''<section class="folha faixa" id="{e(f["id"])}" lang="{e(f.get("idioma", "pt-BR"))}"
  style="--tom:{e(f["cores"]["tom"])}; --tom2:{e(f["cores"]["tom2"])}">
  {artes[i + 2]}
  <div class="conteudo">
    <header><span class="num">{f["numero"]:02d}</span><h2>{e(f["titulo"])}</h2></header>
    {ONDA}
    <p class="creditos" lang="pt-BR"><b>Letra:</b> {e(c["letra"])} &nbsp;·&nbsp; <b>Música:</b> {e(c["musica"])}</p>
    <div class="letra">{estrofes}</div>
  </div>
  <div class="rodape" lang="pt-BR"><span>{e(dados["album"])} · {artistas}</span><span>{i + 3}</span></div>
</section>''')

    ficha = "\n".join(f'<div><dt>{e(c["funcao"])}</dt><dd>{e(c["nomes"])}</dd></div>'
                      for c in dados["creditosGerais"])
    folhas.append(f'''<section class="folha ficha">
  {artes[-1]}
  <div class="conteudo">
    <p class="rotulo">Créditos</p>
    <h2>Ficha técnica</h2>
    <dl>{ficha}</dl>
    <div class="fim"><img src="{capa_url}" alt=""><p>{e(dados["album"])}<small>{artistas}</small></p></div>
  </div>
  <div class="rodape"><span>{e(dados["album"])}</span><span>{len(faixas) + 3}</span></div>
</section>''')

    return f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>{e(dados["album"])} · Encarte</title>
<link rel="stylesheet" href="{FONTES}">
<style>{CSS.replace("{capa}", capa_url)}</style>
</head><body>
{chr(10).join(folhas)}
{'<pre id="medidas" hidden></pre>' if medir else ''}
<script>{AJUSTE}</script>
</body></html>'''


# ---------- Chrome ----------

def _chrome(tmp, *extras):
    return [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            "--disable-background-networking", "--disable-component-update", "--hide-scrollbars",
            f"--user-data-dir={tmp / 'perfil-chrome'}", "--allow-file-access-from-files",
            "--virtual-time-budget=15000", *extras]


def _encerrar(processo):
    if processo.poll() is None:
        processo.terminate()
        try:
            processo.wait(timeout=10)
        except subprocess.TimeoutExpired:
            processo.kill()


def medir_paginas(pagina, tmp):
    """1ª passada: abre a página no Chrome e lê onde ficou cada texto."""
    processo = subprocess.Popen(_chrome(tmp, "--dump-dom", pagina.as_uri()),
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    saida = bytearray()
    leitor = threading.Thread(target=lambda: [saida.extend(b) for b in iter(lambda: processo.stdout.read1(65536), b"")],
                              daemon=True)
    leitor.start()
    limite = time.time() + 120
    while b"</html>" not in saida and time.time() < limite and (processo.poll() is None or leitor.is_alive()):
        time.sleep(0.3)
    _encerrar(processo)
    achado = re.search(r'<pre id="medidas" hidden="">(.*?)</pre>', saida.decode("utf-8", "replace"), re.S)
    if not achado or not achado.group(1).strip():
        sys.exit("Não consegui medir as páginas no Chrome. Verifique a internet e tente de novo.")
    return json.loads(html.unescape(achado.group(1)))


def imprimir_pdf(pagina, tmp):
    """2ª passada: o Chrome 'imprime' a página em PDF."""
    pdf_tmp = tmp / "encarte.pdf"
    # O Chrome grava o PDF mas às vezes não fecha sozinho: esperamos o arquivo ficar pronto e o fechamos.
    processo = subprocess.Popen(_chrome(tmp, "--no-pdf-header-footer", f"--print-to-pdf={pdf_tmp}", pagina.as_uri()),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tamanho, estavel = -1, 0
    for _ in range(240):
        time.sleep(0.5)
        atual = pdf_tmp.stat().st_size if pdf_tmp.exists() else -1
        estavel = estavel + 1 if atual > 0 and atual == tamanho else 0
        tamanho = atual
        if estavel >= 4 or processo.poll() is not None:
            break
    _encerrar(processo)
    if tamanho <= 0:
        sys.exit("O Chrome não conseguiu gerar o PDF em 2 minutos. Feche o Chrome e tente de novo.")
    shutil.move(str(pdf_tmp), SAIDA)


def main():
    if not ENCARTE_JSON.exists():
        sys.exit(f"Não encontrei {ENCARTE_JSON}")
    if not Path(CHROME).exists():
        sys.exit("Não encontrei o Google Chrome em /Applications. Instale o Chrome e rode de novo.")
    dados = json.loads(ENCARTE_JSON.read_text(encoding="utf-8"))
    total = len(dados["faixas"]) + 3
    capa = CAPA if CAPA.exists() else CAPA_SITE
    capa_url = "capa" + capa.suffix

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        shutil.copy(capa, tmp / capa_url)
        pagina = tmp / "encarte.html"

        if "--nova-linha" in sys.argv or not LINHA_SVG.exists():
            if LINHA_SVG.exists():
                copia = LINHA_SVG.with_name("linha-correnteza.anterior.svg")
                shutil.copy(LINHA_SVG, copia)
                print(f"Desenho antigo guardado em {copia.name}")
            print("Medindo onde fica o texto de cada página...")
            pagina.write_text(montar_html(dados, capa_url, medir=True), encoding="utf-8")
            medidas = medir_paginas(pagina, tmp)
            LINHA_SVG.write_text(desenho.desenhar(medidas, titulos_das_paginas(dados)), encoding="utf-8")
            print(f"Rio e montanhas desenhados em {LINHA_SVG.name}")

        artes, aviso = desenho.fatiar(LINHA_SVG.read_text(encoding="utf-8"), total)
        if aviso:
            print(aviso)
        pagina.write_text(montar_html(dados, capa_url, artes), encoding="utf-8")
        imprimir_pdf(pagina, tmp)

    conteudo = SAIDA.read_bytes()
    if b"CormorantGaramond" not in conteudo or b"WorkSans" not in conteudo:
        print("ATENÇÃO: o PDF saiu sem as fontes do site (sem internet?). Rode de novo com internet.")
    print(f"PDF gerado: {SAIDA} ({len(conteudo) / 1024 / 1024:.1f} MB, {total} páginas)")


if __name__ == "__main__":
    main()
