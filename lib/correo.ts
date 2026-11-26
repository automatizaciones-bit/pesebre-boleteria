// Envío de correos con Resend (resend.com). Variables en Vercel:
//   RESEND_API_KEY  · EMAIL_FROM (ej: "Pesebre Tenjo <boletas@tudominio.com>") · ADMIN_EMAIL
// Sin RESEND_API_KEY el sistema funciona igual, sólo no envía correos.

export function correoConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  return {
    key,
    from: process.env.EMAIL_FROM?.trim() || "Boletería Pesebre Tenjo <onboarding@resend.dev>",
    admin: process.env.ADMIN_EMAIL?.trim().toLowerCase() || "",
    activo: !!key,
  };
}

export const emailValido = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export async function enviarCorreo(o: {
  para: string[]; asunto: string; html: string; adjuntos?: { filename: string; content: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  const c = correoConfig();
  if (!c.activo) return { ok: false, error: "correo no configurado" };
  const para = [...new Set(o.para.map((x) => x.trim().toLowerCase()).filter(emailValido))];
  if (para.length === 0) return { ok: false, error: "sin destinatarios" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.from, to: para, subject: o.asunto, html: o.html, attachments: o.adjuntos }),
    });
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  }
}

/** Escapa texto para meterlo en HTML del correo. */
export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export function plantillaCorreo(titulo: string, cuerpo: string) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0a0f24;font-family:Arial,sans-serif;color:#f4efe2">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<h1 style="font-family:Georgia,serif;color:#ffd97a;text-align:center;margin:8px 0 18px">${esc(titulo)}</h1>
<div style="background:#121a3a;border:1px solid #6b5420;border-radius:14px;padding:20px">${cuerpo}</div>
<p style="color:#a9b0cc;font-size:12px;text-align:center;margin-top:16px">El Gran Pesebre de Tenjo 2026</p>
</div></body></html>`;
}
