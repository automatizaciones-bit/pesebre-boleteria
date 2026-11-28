import { db, json, sesionActual, explicar } from "@/lib/db";
import { notificarCompra, origenPublico } from "@/lib/notificar";

// Reenvía la entrada por correo / WhatsApp (por ejemplo si el cliente corrigió su correo).
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const { id, email } = await req.json().catch(() => ({}));
  const compraId = Number(id);
  if (!compraId) return json({ error: "Compra inválida" }, 400);
  try {
    const { data: c } = await db().from("compras").select("prueba").eq("id", compraId).maybeSingle();
    if (!c) return json({ error: "La compra no existe" }, 404);
    if (s.rol !== "admin" && c.prueba !== s.prueba) return json({ error: "Esa compra no es de tu ambiente (capacitación / real)." }, 403);
    const cambios: Record<string, unknown> = { email_enviado_at: null, whatsapp_enviado_at: null };
    if (typeof email === "string" && email.trim()) cambios.email = email.trim().toLowerCase().slice(0, 120);
    const { error } = await db().from("compras").update(cambios).eq("id", compraId);
    if (error) return json({ error: explicar(error) }, 500);
    return json({ envio: await notificarCompra(compraId, origenPublico(req)) });
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
