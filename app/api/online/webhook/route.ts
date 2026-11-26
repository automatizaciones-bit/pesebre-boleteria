import { db, json, explicar } from "@/lib/db";
import { notificarCompra, origenPublico } from "@/lib/notificar";
import { eventoAutentico, wompi } from "@/lib/wompi";

// URL de eventos para configurar en Wompi → Desarrolladores → "URL de Eventos":
//   https://TU-DOMINIO/api/online/webhook
export async function POST(req: Request) {
  const secreto = wompi().eventos;
  if (!secreto) return json({ error: "WOMPI_EVENTS_SECRET no configurado" }, 503);
  const ev = await req.json().catch(() => null);
  if (!ev || !eventoAutentico(ev, secreto)) return json({ error: "Firma inválida" }, 401);
  if (ev.event !== "transaction.updated") return json({ ok: true, ignorado: ev.event });

  const t = ev.data?.transaction;
  if (!t?.reference) return json({ ok: true, ignorado: "sin referencia" });
  try {
    const { data, error } = await db().rpc("confirmar_pago", {
      p_token: t.reference, p_pasarela_id: t.id, p_estado: t.status, p_monto_centavos: t.amount_in_cents,
    });
    if (error) return json({ error: explicar(error) }, 500);
    if (data.ok && data.estado === "pagado" && !data.repetido) {
      const { data: x } = await db().from("compras").select("id").eq("token", t.reference).single();
      if (x) await notificarCompra(x.id, origenPublico(req));
    }
    return json(data);
  } catch (e) {
    return json({ error: explicar(e) }, 500);
  }
}
