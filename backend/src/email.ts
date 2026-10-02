// E-mails enviados pelo Resend: o de agradecimento com o link de acesso e o de confirmação do mural.
// Sem RESEND_API_KEY, nada é enviado: só fica registrado no log (npm run logs).
// Para mudar os textos, edite as funções logo abaixo.

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailConfigurado(env: Env): boolean {
  return !!env.RESEND_API_KEY;
}

// moldura comum: fundo azul-noite, título em serifa e assinatura da dupla
function moldura(rotulo: string, titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#0E1826;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#E7ECEE">
  <div style="max-width:520px;margin:0 auto">
    <p style="margin:0 0 6px;font-style:italic;color:#C68B3E;font-size:17px">${rotulo}</p>
    <h1 style="margin:0 0 16px;font-weight:500;font-size:34px;line-height:1.1">${titulo}</h1>
    ${corpo}
    <p style="margin:0;font-size:16px">Thales Carvalho &amp; Thayson Azevedo</p>
  </div>
</body></html>`;
}

function botao(link: string, texto: string): string {
  return `<p style="margin:0 0 26px">
      <a href="${escapar(link)}" style="display:inline-block;background:#C68B3E;color:#0E1826;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:999px">${texto}</a>
    </p>`;
}

const PARAGRAFO = "margin:0 0 22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#B9C8D3";
const NOTA = "margin:0 0 28px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#A9BCCB";

// ----- E-mail de acesso -----

function textoDoEmail(link: string, codigo: string, aparelhos: string, baixar: boolean): string {
  return [
    "Obrigado por adquirir Correnteza!",
    "",
    "Seu apoio ajuda a gente a continuar fazendo música independente.",
    "",
    baixar ? "Ouça o álbum, leia o encarte e baixe as faixas por este link:" : "Ouça o álbum completo e leia o encarte por este link:",
    link,
    "",
    `Seu código de acesso: ${codigo}`,
    `Ele funciona em até ${aparelhos} aparelhos ou navegadores. Para usar num aparelho novo, desconecte um antigo na própria página do álbum.`,
    "Guarde este e-mail.",
    "",
    "Thales Carvalho & Thayson Azevedo",
  ].join("\n");
}

function htmlDoEmail(link: string, codigo: string, aparelhos: string, baixar: boolean): string {
  const l = escapar(link);
  return moldura(
    "Obrigado!",
    "Correnteza",
    `<p style="${PARAGRAFO}">
      Seu apoio ajuda a gente a continuar fazendo música independente. Pelo botão abaixo você ouve as nove faixas
      e lê o encarte com as letras e os créditos${baixar ? ", e baixa tudo (MP3 e PDF)" : ", que também pode ser baixado em PDF"}.
    </p>
    ${botao(link, "Ouvir o álbum")}
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:#A9BCCB">Seu código de acesso</p>
    <p style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:20px;letter-spacing:2px">${escapar(codigo)}</p>
    <p style="${NOTA}">
      Ele funciona em até ${escapar(aparelhos)} aparelhos ou navegadores. Para usar num aparelho novo, desconecte um antigo
      na própria página do álbum. Guarde este e-mail.<br>
      Se o botão não abrir, copie este endereço: <a href="${l}" style="color:#C68B3E">${l}</a>
    </p>`,
  );
}

export async function enviarEmailDeAcesso(env: Env, dados: { para: string; codigo: string; pedidoId: string }): Promise<{ enviado: boolean }> {
  const link = new URL(env.PAGINA_ALBUM);
  link.searchParams.set("codigo", dados.codigo);
  const aparelhos = String(Number(env.LIMITE_APARELHOS) || 3);
  const baixar = String(env.DOWNLOAD_FAIXAS) === "sim";
  return enviarEmail(env, {
    para: dados.para,
    assunto: "Seu acesso ao álbum Correnteza",
    html: htmlDoEmail(link.toString(), dados.codigo, aparelhos, baixar),
    texto: textoDoEmail(link.toString(), dados.codigo, aparelhos, baixar),
    idempotencia: `acesso-${dados.pedidoId}`, // o mesmo pedido nunca recebe dois e-mails iguais
    registro: `pedido ${dados.pedidoId}`,
  });
}

// ----- Confirmação do e-mail de quem comenta no mural sem ter comprado -----

export async function enviarConfirmacaoMural(env: Env, dados: { para: string; nome: string; link: string; comentarioId: string }): Promise<{ enviado: boolean }> {
  return enviarEmail(env, {
    para: dados.para,
    assunto: "Confirme seu comentário no mural de Correnteza",
    html: moldura(
      `Olá, ${escapar(dados.nome)}!`,
      "Falta só confirmar",
      `<p style="${PARAGRAFO}">Recebemos seu comentário no mural de Correnteza. Para ele entrar no mural, confirme que este e-mail é seu:</p>
      ${botao(dados.link, "Confirmar meu comentário")}
      <p style="${NOTA}">Se não foi você, ignore este e-mail: o comentário não será publicado.</p>`,
    ),
    texto: [
      `Olá, ${dados.nome}!`,
      "",
      "Recebemos seu comentário no mural de Correnteza. Para ele entrar no mural, confirme que este e-mail é seu:",
      dados.link,
      "",
      "Se não foi você, ignore este e-mail: o comentário não será publicado.",
      "",
      "Thales Carvalho & Thayson Azevedo",
    ].join("\n"),
    idempotencia: `mural-${dados.comentarioId}`,
    registro: `comentário ${dados.comentarioId}`,
  });
}

// ----- Envio -----

async function enviarEmail(
  env: Env,
  dados: { para: string; assunto: string; html: string; texto: string; idempotencia: string; registro: string },
): Promise<{ enviado: boolean }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[e-mail NÃO enviado: falta RESEND_API_KEY] ${dados.assunto} (${dados.registro})`);
    return { enviado: false };
  }
  // RESEND_API_BASE só existe para testes locais (npm run dev); em produção fica vazio.
  const resposta = await fetch(`${env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": dados.idempotencia,
    },
    body: JSON.stringify({
      from: env.EMAIL_REMETENTE,
      to: [dados.para],
      subject: dados.assunto,
      html: dados.html,
      text: dados.texto,
      ...(env.EMAIL_RESPONDER_PARA ? { reply_to: env.EMAIL_RESPONDER_PARA } : {}),
    }),
  });
  if (!resposta.ok) {
    console.error(`Resend recusou o e-mail (${dados.registro}): ${resposta.status} ${await resposta.text()}`);
    return { enviado: false };
  }
  console.log(`E-mail enviado: ${dados.assunto} (${dados.registro}).`);
  return { enviado: true };
}
