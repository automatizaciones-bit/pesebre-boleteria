// WhatsApp Cloud API (Meta). Variables en Vercel:
//   WHATSAPP_TOKEN · WHATSAPP_PHONE_ID · WHATSAPP_TEMPLATE (nombre de la plantilla aprobada) · WHATSAPP_LANG (es)
// La plantilla se aprueba UNA sola vez en Meta. Debe tener:
//   Encabezado: IMAGEN (aquí va el QR de cada compra)
//   Cuerpo con 4 variables: {{1}} nombre · {{2}} fecha · {{3}} grupo · {{4}} enlace a las boletas
// Sin estas variables el sistema funciona igual y se usa el botón manual de WhatsApp.

export function whatsappConfig() {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  return {
    token, phoneId,
    plantilla: process.env.WHATSAPP_TEMPLATE?.trim() || "entrada_pesebre",
    idioma: process.env.WHATSAPP_LANG?.trim() || "es",
    activo: !!token && !!phoneId,
  };
}

export async function enviarPlantillaWhatsApp(o: {
  celular: string; imagenUrl: string; nombre: string; fecha: string; grupo: string; enlace: string;
}): Promise<{ ok: boolean; error?: string }> {
  const w = whatsappConfig();
  if (!w.activo) return { ok: false, error: "whatsapp no configurado" };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${w.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `57${o.celular}`,
        type: "template",
        template: {
          name: w.plantilla,
          language: { code: w.idioma },
          components: [
            { type: "header", parameters: [{ type: "image", image: { link: o.imagenUrl } }] },
            { type: "body", parameters: [o.nombre, o.fecha, o.grupo, o.enlace].map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    });
    if (!r.ok) return { ok: false, error: `WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph(ruta: string, cuerpo?: unknown) {
  const w = whatsappConfig();
  const r = await fetch(`${GRAPH}/${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  const datos = await r.json().catch(() => ({}));
  return { ok: r.ok, datos };
}

/** Estado del número en Meta (nombre aprobado, conectado, calidad, límite). */
export async function estadoNumeroWhatsApp() {
  const w = whatsappConfig();
  if (!w.activo) return { configurado: false as const };
  const r = await graph(
    `${w.phoneId}?fields=display_phone_number,verified_name,name_status,status,quality_rating,code_verification_status,platform_type,messaging_limit_tier`,
  );
  return { configurado: true as const, ok: r.ok, plantilla: w.plantilla, idioma: w.idioma, ...r.datos };
}

/** Registra (activa) el número en la API de la nube con un PIN de 6 dígitos. */
export async function registrarNumeroWhatsApp(pin: string) {
  const w = whatsappConfig();
  if (!w.activo) return { ok: false, datos: { error: { message: "WhatsApp no configurado en Vercel" } } };
  return graph(`${w.phoneId}/register`, { messaging_product: "whatsapp", pin });
}
