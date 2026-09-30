"""
Desenho da "linha de correnteza" e das montanhas do encarte.

O desenho é uma tira vertical com todas as páginas empilhadas (210 mm de largura,
210 mm de altura por página), salva em correnteza-privado/encarte/linha-correnteza.svg.
Cada página do PDF mostra o seu pedaço da tira, por isso a linha passa de uma
página para a seguinte sem emenda.

O arquivo pode ser aberto e editado no Inkscape (gratuito), Figma ou Illustrator.
A camada "guias" (molduras das páginas e áreas de texto em rosa) serve só de
referência e nunca entra no PDF.
"""
import math
import re
import xml.etree.ElementTree as ET

PAGINA = 210.0             # mm; as páginas são quadradas
MARGEM_DIREITA = 203.0     # o rio nunca passa deste ponto
FOLGA_TEXTO = 8.0          # distância mínima entre o rio e o fim de um verso
FOLGA_VERTICAL = 5.0
NASCENTE = (100.0, 161.0)  # centro das ondas na foto da capa, onde o rio nasce

SVG_NS = "http://www.w3.org/2000/svg"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
for _prefixo, _ns in {"": SVG_NS, "inkscape": INKSCAPE_NS,
                      "sodipodi": "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
                      "xlink": "http://www.w3.org/1999/xlink"}.items():
    ET.register_namespace(_prefixo, _ns)

ESTILO = """
    /* Cores e espessuras do desenho (espessuras em mm). Pode trocar à vontade. */
    .lc-rio         { fill:none; stroke:#C68B3E; stroke-width:0.5;  stroke-linecap:round; stroke-linejoin:round; }
    .lc-brilho      { fill:none; stroke:#C68B3E; stroke-width:2.6;  stroke-linecap:round; opacity:0.10; }
    .lc-eco         { fill:none; stroke:#A9BCCB; stroke-width:0.22; stroke-linecap:round; opacity:0.38; }
    .lc-eco-2       { fill:none; stroke:#A9BCCB; stroke-width:0.15; stroke-linecap:round; opacity:0.20; }
    .lc-nascente    { fill:none; stroke:#C68B3E; stroke-width:0.3;  opacity:0.6; }
    .lc-serra-longe { fill:#1A2D45; }
    .lc-nevoa       { fill:#E7ECEE; opacity:0.05; }
    .lc-serra-meio  { fill:#13223A; }
    .lc-serra-perto { fill:#0E1826; }
"""

# (classe, altura máxima em mm, fração do espaço livre que pode ocupar)
CAMADAS_SERRA = [
    ("lc-serra-longe", 82.0, 1.00),
    ("lc-nevoa", 64.0, 0.86),
    ("lc-serra-meio", 52.0, 0.72),
    ("lc-serra-perto", 26.0, 0.42),
]


def _n(v):
    return f"{v:.1f}"


def suavizar(valores, sigma):
    """Média ponderada (gaussiana) para deixar as curvas macias."""
    raio = max(int(3 * sigma), 1)
    pesos = [math.exp(-(i * i) / (2 * sigma * sigma)) for i in range(-raio, raio + 1)]
    n = len(valores)
    saida = []
    for i in range(n):
        soma = total = 0.0
        for j, p in enumerate(pesos):
            soma += valores[min(max(i + j - raio, 0), n - 1)] * p
            total += p
        saida.append(soma / total)
    return saida


def caminho_suave(pontos):
    """Liga os pontos com curvas (Catmull-Rom convertida em Bézier)."""
    d = [f"M{_n(pontos[0][0])} {_n(pontos[0][1])}"]
    for i in range(len(pontos) - 1):
        p0, p1 = pontos[max(i - 1, 0)], pontos[i]
        p2, p3 = pontos[i + 1], pontos[min(i + 2, len(pontos) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{_n(c1[0])} {_n(c1[1])} {_n(c2[0])} {_n(c2[1])} {_n(p2[0])} {_n(p2[1])}")
    return " ".join(d)


# ---------- o rio ----------

def _inicio_livre(retangulos, y):
    """Primeiro x livre à direita do texto nesta altura da página."""
    direita = None
    for x0, y0, x1, y1, _tipo in retangulos:
        if y0 - FOLGA_VERTICAL <= y <= y1 + FOLGA_VERTICAL:
            direita = x1 if direita is None else max(direita, x1)
    if direita is None:
        return 12.0
    return min(direita + FOLGA_TEXTO, MARGEM_DIREITA - 3.0)


def tracar_rio(medidas):
    n = len(medidas)
    passo = 2.0
    ys = [NASCENTE[1] + i * passo for i in range(int((n * PAGINA - NASCENTE[1]) / passo) + 1)]
    limite = []
    for y in ys:
        k = min(int(y // PAGINA), n - 1)
        limite.append(_inicio_livre(medidas[k], y - k * PAGINA))
    # o rio começa a se afastar do texto antes de chegar nele (curvas largas, sem degraus)
    janela = 6
    limite = [max(limite[max(i - janela, 0):i + janela + 1]) for i in range(len(limite))]
    limite = suavizar(limite, 3)
    alvo = []
    for y, esquerda in zip(ys, limite):
        # ondulação irregular, como a linha das serras
        onda = 0.62 * math.sin(2 * math.pi * y / 181 + 0.9) + 0.38 * math.sin(2 * math.pi * y / 83 + 2.3)
        alvo.append(esquerda + (MARGEM_DIREITA - esquerda) * (0.5 + 0.45 * onda))
    xs = suavizar(alvo, 5)
    for _ in range(6):  # respeita o texto sem perder a suavidade
        xs = [min(max(x, l), MARGEM_DIREITA) for x, l in zip(xs, limite)]
        xs = suavizar(xs, 3)
    xs = [min(max(x, l - 1.5), MARGEM_DIREITA + 1.5) for x, l in zip(xs, limite)]
    for i, y in enumerate(ys):  # sai exatamente do centro das ondas da capa
        t = min((y - NASCENTE[1]) / 32.0, 1.0)
        t = t * t * (3 - 2 * t)
        xs[i] = NASCENTE[0] + (xs[i] - NASCENTE[0]) * t
    return list(zip(xs, ys))


def _paralela(pontos, distancia, periodo, fase):
    """Linha de água que acompanha o rio, ora mais perto, ora mais longe."""
    return [(x + distancia * (1 + 0.45 * math.sin(y / periodo + fase)), y) for x, y in pontos]


# ---------- as montanhas ----------

def _fundo_do_texto(retangulos, x):
    fundo = None
    for x0, _y0, x1, y1, tipo in retangulos:
        if tipo == "texto" and x0 - 5 <= x <= x1 + 5:
            fundo = y1 if fundo is None else max(fundo, y1)
    return fundo


def _ruido(x, semente):
    return (0.5 * math.sin(x / 23.0 + semente * 1.7)
            + 0.3 * math.sin(x / 10.7 + semente * 3.1)
            + 0.2 * math.sin(x / 5.3 + semente * 5.3))


def serras(retangulos, k):
    """Montanhas em camadas no pé da página k, sem cobrir o texto."""
    passo = 2.0
    xs = [-6 + i * passo for i in range(int((PAGINA + 12) / passo) + 1)]
    livre = []
    for x in xs:
        fundo = _fundo_do_texto(retangulos, x)
        livre.append(max(0.0, PAGINA - 3 - ((fundo if fundo is not None else 40.0) + 7)))
    janela = 4
    livre = [min(livre[max(i - janela, 0):i + janela + 1]) for i in range(len(livre))]
    base = k * PAGINA + PAGINA
    caminhos = []
    for j, (classe, maximo, fracao) in enumerate(CAMADAS_SERRA):
        alturas = [maximo * (0.6 + 0.4 * _ruido(x, k * 4 + j)) for x in xs]
        alturas = [min(a, l * fracao) for a, l in zip(alturas, livre)]
        alturas = suavizar(alturas, 3)
        alturas = [min(a, l * fracao) for a, l in zip(alturas, livre)]
        alturas = suavizar(alturas, 1.2)
        pontos = [(x, base - a) for x, a in zip(xs, alturas)]
        d = caminho_suave(pontos) + f" L{_n(xs[-1])} {_n(base + 1)} L{_n(xs[0])} {_n(base + 1)} Z"
        caminhos.append(f'<path class="{classe}" d="{d}"/>')
    return caminhos


# ---------- o arquivo SVG ----------

def desenhar(medidas, titulos):
    """Gera o SVG completo (todas as páginas empilhadas) a partir das medidas do texto."""
    n = len(medidas)
    altura = n * PAGINA
    montanhas = []
    for k in range(1, n):  # a capa é a foto, sem montanhas
        montanhas += serras(medidas[k], k)

    rio = tracar_rio(medidas)
    d_rio = caminho_suave(rio)
    nx, ny = NASCENTE
    nascente = "".join(f'<ellipse class="lc-nascente" cx="{nx}" cy="{ny}" rx="{r}" ry="{_n(r * 0.32)}"/>'
                       for r in (2.2, 4.6, 7.4))

    guias = []
    for k, retangulos in enumerate(medidas):
        topo = k * PAGINA
        guias.append(f'<rect x="0" y="{_n(topo)}" width="{PAGINA}" height="{PAGINA}" fill="none" '
                     f'stroke="#FF3D8B" stroke-width="0.4" stroke-dasharray="3 2"/>')
        guias.append(f'<text x="3" y="{_n(topo + 6)}" font-size="4" fill="#FF3D8B" '
                     f'font-family="sans-serif">página {k + 1} · {titulos[k]}</text>')
        for x0, y0, x1, y1, _tipo in retangulos:
            guias.append(f'<rect x="{_n(x0)}" y="{_n(topo + y0)}" width="{_n(x1 - x0)}" '
                         f'height="{_n(y1 - y0)}" fill="#FF3D8B" fill-opacity="0.18"/>')

    return f'''<svg xmlns="{SVG_NS}" xmlns:inkscape="{INKSCAPE_NS}"
     width="{PAGINA:g}mm" height="{altura:g}mm" viewBox="0 0 {PAGINA:g} {altura:g}">
  <title>Correnteza · linha do encarte ({n} páginas empilhadas, 210 mm cada)</title>
  <style>{ESTILO}  </style>
  <g id="montanhas" inkscape:label="montanhas" inkscape:groupmode="layer">
    {chr(10).join("    " + c for c in montanhas).strip()}
  </g>
  <g id="correnteza" inkscape:label="correnteza" inkscape:groupmode="layer">
    <path class="lc-brilho" d="{d_rio}"/>
    <path class="lc-eco-2" d="{caminho_suave(_paralela(rio, 4.8, 29.0, 1.1))}"/>
    <path class="lc-eco" d="{caminho_suave(_paralela(rio, 2.4, 17.0, 0.3))}"/>
    <path class="lc-eco" d="{caminho_suave(_paralela(rio, -2.4, 23.0, 2.0))}"/>
    <path class="lc-rio" d="{d_rio}"/>
    {nascente}
  </g>
  <g id="guias" inkscape:label="guias (não entra no PDF)" inkscape:groupmode="layer" opacity="0.6">
    {chr(10).join("    " + g for g in guias).strip()}
  </g>
</svg>
'''


def _eh_guia(el):
    rotulo = (el.get("id") or "") + " " + (el.get(f"{{{INKSCAPE_NS}}}label") or "")
    return "guias" in rotulo.lower()


def fatiar(svg_texto, total_paginas):
    """Recorta o desenho em uma fatia por página (sem as guias). Devolve (fatias, aviso)."""
    raiz = ET.fromstring(svg_texto)
    for pai in list(raiz.iter()):
        for filho in list(pai):
            if _eh_guia(filho):
                pai.remove(filho)
    caixa = raiz.get("viewBox")
    if caixa:
        vx, vy, vw, vh = (float(v) for v in re.split(r"[\s,]+", caixa.strip()))
    else:
        vx, vy = 0.0, 0.0
        vw, vh = (float(re.sub(r"[^\d.]", "", raiz.get(a, "0"))) for a in ("width", "height"))
    aviso = None
    if abs(vh - total_paginas * vw) > 0.02 * vw:
        aviso = (f"ATENÇÃO: linha-correnteza.svg foi desenhado para {vh / vw:.0f} páginas, mas o encarte "
                 f"tem {total_paginas}. Rode com --nova-linha para redesenhar.")
    for atributo in ("width", "height", "x", "y"):
        raiz.attrib.pop(atributo, None)
    raiz.set("class", "arte")
    raiz.set("aria-hidden", "true")
    raiz.set("preserveAspectRatio", "none")
    fatias = []
    for k in range(total_paginas):
        raiz.set("viewBox", f"{vx:g} {vy + k * vw:g} {vw:g} {vw:g}")
        fatias.append(ET.tostring(raiz, encoding="unicode"))
    return fatias, aviso
