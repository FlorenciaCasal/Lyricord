type SendPasswordResetEmailOptions = {
  to: string;
  resetUrl: string;
};

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
};

function getPasswordResetEmailText(resetUrl: string) {
  return [
    "Recibimos un pedido para restablecer la contraseña de tu cuenta de Lyricord.",
    "",
    "Para elegir una nueva contraseña, abrí este link:",
    resetUrl,
    "",
    "El link vence en 1 hora. Si no pediste este cambio, podés ignorar este email.",
  ].join("\n");
}

function getPasswordResetEmailHtml(resetUrl: string) {
  return `
    <p>Recibimos un pedido para restablecer la contraseña de tu cuenta de Lyricord.</p>
    <p>
      <a href="${resetUrl}">Elegir una nueva contraseña</a>
    </p>
    <p>El link vence en 1 hora. Si no pediste este cambio, podés ignorar este email.</p>
  `;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  const replyTo = process.env.PASSWORD_RESET_REPLY_TO;

  if (!apiKey || !from) {
    console.error("Password reset email: faltan variables de entorno.", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
    });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: "Restablecé tu contraseña de Lyricord",
        text: getPasswordResetEmailText(resetUrl),
        html: getPasswordResetEmailHtml(resetUrl),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | ResendEmailResponse
        | null;

      console.error("Password reset email: Resend rechazó el envío.", {
        status: response.status,
        error: payload?.message ?? payload?.name ?? "unknown",
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Password reset email: no pudimos enviar el email.", {
      error,
    });
    return false;
  }
}
