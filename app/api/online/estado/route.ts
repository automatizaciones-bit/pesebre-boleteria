import { db, json, explicar } from "@/lib/db";
import { notificarCompra, origenPublico } from "@/lib/notificar";
import { consultarTransaccion } from "@/lib/wompi";

// Estado de una compra en línea. Si viene ?id= (lo agrega Wompi al volver), se verifica
// la transacción directamente con Wompi antes de activar las boletas.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const ref = u.get("ref") ?? "";
  const id = u.get("id") ?? "";
  if (!/^[A-Z2-9]{16}$/.test(ref)) return json({ error: "Referencia inválida" }, 400);
  try {
    const { data: c } = await db().from("compras").select("estado_pago, anulada, canal")
      .eq("token", ref).eq("canal", "online").maybeSingle();
    if (!c) return json({ error: "Compra no encontrada" }, 404);
    if (c.estado_pago === "pendiente" && id) {
      const t = await consultarTransaccion(id);
      if (t && t.reference === ref) {
        const { data, error } = await db().rpc("confirmar_pago", {
          p_token: ref, p_pasarela_id: t.id, p_estado: t.status, p_monto_centavos: t.amount_in_cents,
        });
        if (error) return json({ error: explicar(error) }, 500);
        if (data.ok && data.estado === "pagado" && !data.repetido) {
          const { data: x } = await db().from("compras").select("id").eq("token", ref).single();
          if (x) await notificarCompra(x.id, origenPublico(req));
        }
        return json({ estado: data.estado ?? c.estado_pago, error: data.ok ? undefined : data.error });
      }
    }
    return json({ estado: c.anulada ? "anulada" : c.estado_pago });
  } catch (e) {
    return json({ error: explicar(e) }, 500);
  }
}
