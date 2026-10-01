// E-mail de agradecimento com o link de acesso, enviado pelo Resend.
// Sem RESEND_API_KEY, nada é enviado: só fica registrado no log (npm run logs).
// Para mudar o texto do e-mail, edite as funções textoDoEmail e htmlDoEmail abaixo.

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function textoDoEmail(link: string, codigo: string, aparelhos: string): string {
  return [
    "Obrigado por adquirir Correnteza!",
    "",
    "Seu apoio ajuda a gente a continuar fazendo música independente.",
    "",
    `Ouça o álbum, leia o encarte e baixe as faixas por este link:`,
    link,
    "",
    `Seu código de acesso: ${codigo}`,
    `Ele funciona em até ${aparelhos} aparelhos ou navegadores. Guarde este e-mail.`,
    "",
    "Thales Carvalho & Thayson Azevedo",
  ].join("\n");
}

function htmlDoEmail(link: string, codigo: string, aparelhos: string): string {
  const l = escapar(link);
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#0E1826;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#E7ECEE">
  <div style="max-width:520px;margin:0 auto">
    <p style="margin:0 0 6px;font-style:italic;color:#C68B3E;font-size:17px">Obrigado!</p>
    <h1 style="margin:0 0 16px;font-weight:500;font-size:34px;line-height:1.1">Correnteza</h1>
    <p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#B9C8D3">
      Seu apoio ajuda a gente a continuar fazendo música independente. Pelo botão abaixo você ouve as nove faixas,
      lê o encarte com as letras e os créditos e baixa tudo (MP3 e PDF).
    </p>
    <p style="margin:0 0 26px">
      <a href="${l}" style="display:inline-block;background:#C68B3E;color:#0E1826;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:999px">Ouvir o álbum</a>
    </p>
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:#A9BCCB">Seu código de acesso</p>
    <p style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:20px;letter-spacing:2px">${escapar(codigo)}</p>
    <p style="margin:0 0 28px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#A9BCCB">
      Ele funciona em até ${escapar(aparelhos)} aparelhos ou navegadores. Guarde este e-mail.<br>
      Se o botão não abrir, copie este endereço: <a href="${l}" style="color:#C68B3E">${l}</a>
    </p>
    <p style="margin:0;font-size:16px">Thales Carvalho &amp; Thayson Azevedo</p>
  </div>
</body></html>`;
}

export async function enviarEmailDeAcesso(
  env: Env,
  dados: { para: string; codigo: string; pedidoId: string },
): Promise<{ enviado: boolean }> {
  const link = new URL(env.PAGINA_ALBUM);
  link.searchParams.set("codigo", dados.codigo);
  const aparelhos = String(Number(env.LIMITE_APARELHOS) || 3);

  if (!env.RESEND_API_KEY) {
    console.log(`[e-mail NÃO enviado: falta RESEND_API_KEY] Para: ${dados.para} | Pedido: ${dados.pedidoId} | Link: ${link}`);
    return { enviado: false };
  }

  // RESEND_API_BASE só existe para testes locais (npm run dev); em produção fica vazio.
  const resposta = await fetch(`${env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `acesso-${dados.pedidoId}`, // o mesmo pedido nunca recebe dois e-mails iguais
    },
    body: JSON.stringify({
      from: env.EMAIL_REMETENTE,
      to: [dados.para],
      subject: "Seu acesso ao álbum Correnteza",
      html: htmlDoEmail(link.toString(), dados.codigo, aparelhos),
      text: textoDoEmail(link.toString(), dados.codigo, aparelhos),
      ...(env.EMAIL_RESPONDER_PARA ? { reply_to: env.EMAIL_RESPONDER_PARA } : {}),
    }),
  });
  if (!resposta.ok) {
    console.error(`Resend recusou o e-mail do pedido ${dados.pedidoId}: ${resposta.status} ${await resposta.text()}`);
    return { enviado: false };
  }
  console.log(`E-mail de acesso enviado (pedido ${dados.pedidoId}).`);
  return { enviado: true };
}
