import { json } from "@/lib/db";
import { origenPublico } from "@/lib/notificar";
import { enviarPlantillaWhatsApp, estadoNumeroWhatsApp, registrarNumeroWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Solo admin (middleware). GET: estado del número. POST: { accion: "registrar", pin } | { accion: "probar", celular }
export async function GET() {
  return json(await estadoNumeroWhatsApp());
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.accion === "registrar") {
    const pin = String(b.pin ?? "");
    if (!/^\d{6}$/.test(pin)) return json({ error: "El PIN debe tener 6 dígitos." }, 400);
    const r = await registrarNumeroWhatsApp(pin);
    if (!r.ok) return json({ error: r.datos?.error?.error_user_msg || r.datos?.error?.message || "Meta rechazó el registro." }, 400);
    return json({ ok: true });
  }
  if (b.accion === "probar") {
    const celular = String(b.celular ?? "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
    if (!/^3\d{9}$/.test(celular)) return json({ error: "Escribe un celular colombiano de 10 dígitos (3xx)." }, 400);
    const origen = origenPublico(req);
    const r = await enviarPlantillaWhatsApp({
      celular,
      imagenUrl: `${origen}/logo.png`,
      nombre: "Prueba",
      fecha: "sábado 12 de diciembre",
      grupo: "2 adultos, 1 niño",
      enlace: `${origen}/c/PRUEBA`,
      detalle: "2 adultos $80.000 · 1 niño $20.000",
      total: "$100.000", metodo: "Efectivo", recibo: "0000",
    });
    if (!r.ok) return json({ error: r.error }, 400);
    return json({ ok: true });
  }
  return json({ error: "Acción no válida." }, 400);
}
