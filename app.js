// Monta o site a partir de content/site.json (o arquivo que o Pages CMS edita).
// Você não precisa mexer aqui para trocar textos, fotos ou músicas.

const $ = (id) => document.getElementById(id);

function paragrafos(texto) {
  const div = document.createElement("div");
  (texto || "").split(/\n\s*\n/).filter(Boolean).forEach((t) => {
    const p = document.createElement("p");
    p.textContent = t.trim();
    div.appendChild(p);
  });
  return div.innerHTML;
}

function spotifyEmbed(link) {
  const m = (link || "").match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}

function el(tag, attrs = {}, texto) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (texto) e.textContent = texto;
  return e;
}

async function montar() {
  const c = await fetch("content/site.json", { cache: "no-cache" }).then((r) => r.json());

  document.title = c.nome;
  $("nome").textContent = c.nome;
  $("chamada").textContent = c.chamada || "";
  if (c.foto_capa) $("capaImg").src = c.foto_capa;

  $("historiaTitulo").textContent = c.historia?.titulo || "A história";
  $("historiaTexto").innerHTML = paragrafos(c.historia?.texto);

  const lista = $("listaMusicas");
  (c.musicas || []).forEach((m) => {
    const card = el("article", { class: "musica" });
    card.appendChild(el("h3", {}, m.titulo));
    if (m.artista) card.appendChild(el("p", { class: "artista" }, m.artista));
    if (m.descricao) card.appendChild(el("p", {}, m.descricao));
    const emb = spotifyEmbed(m.link);
    if (emb) {
      card.appendChild(el("iframe", { src: emb, loading: "lazy", title: `Ouvir ${m.titulo}`, allow: "encrypted-media; clipboard-write; fullscreen; picture-in-picture" }));
    } else if (m.link) {
      card.appendChild(el("a", { href: m.link, target: "_blank", rel: "noopener" }, "Ouvir"));
    }
    lista.appendChild(card);
  });

  const l = c.lancamento || {};
  if (l.titulo) {
    $("lancTitulo").textContent = l.titulo;
    $("lancSub").textContent = l.subtitulo || "";
    $("lancTexto").innerHTML = paragrafos(l.texto);
    if (l.imagem) { $("lancImg").src = l.imagem; $("lancImg").alt = l.titulo; }
  } else {
    $("lancamento").remove();
  }

  const linha = $("linha");
  (c.trajetoria || []).forEach((t) => {
    const li = el("li");
    li.appendChild(el("span", { class: "ano" }, t.ano));
    li.appendChild(el("h3", {}, t.titulo));
    if (t.descricao) li.appendChild(el("p", {}, t.descricao));
    linha.appendChild(li);
  });

  if (c.raizes?.texto) {
    $("raizesTitulo").textContent = c.raizes.titulo || "Raízes no rock";
    $("raizesTexto").innerHTML = paragrafos(c.raizes.texto);
  } else {
    $("raizes").remove();
  }

  const grade = $("grade");
  const visor = $("visor");
  (c.galeria || []).forEach((g) => {
    if (!g.imagem) return;
    const b = el("button", { type: "button", "aria-label": g.legenda || "Ver foto" });
    b.appendChild(el("img", { src: g.imagem, alt: g.legenda || "", loading: "lazy" }));
    b.onclick = () => {
      visor.querySelector("img").src = g.imagem;
      visor.querySelector("p").textContent = g.legenda || "";
      visor.showModal();
    };
    grade.appendChild(b);
  });
  visor.querySelector("button").onclick = () => visor.close();
  visor.onclick = (e) => { if (e.target === visor) visor.close(); };

  const ct = c.contato || {};
  $("contatoTexto").textContent = ct.texto || "";
  const links = $("links");
  const add = (rotulo, href) => {
    if (!href) return;
    const li = el("li");
    li.appendChild(el("a", { href, target: "_blank", rel: "noopener" }, rotulo));
    links.appendChild(li);
  };
  if (ct.email) add("E-mail", `mailto:${ct.email}`);
  add("Instagram", ct.instagram);
  add("Spotify", ct.spotify);
  add("YouTube", ct.youtube);
  if (!links.children.length) { $("contato").remove(); $("menuContato").remove(); }
}

$("ano").textContent = new Date().getFullYear();
$("menuBtn").onclick = () => {
  const aberto = $("menu").classList.toggle("aberto");
  $("menuBtn").setAttribute("aria-expanded", aberto);
};
$("menu").addEventListener("click", (e) => { if (e.target.tagName === "A") $("menu").classList.remove("aberto"); });

montar().catch((e) => console.error("Erro ao carregar o conteúdo:", e));
