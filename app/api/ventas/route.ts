import { db, json, sesionActual } from "@/lib/db";
import { limpiar, validar, guardarCompra } from "@/lib/ventas";
import { notificarCompra, origenPublico } from "@/lib/notificar";

// Venta en taquilla. Exige caja abierta para el puesto (arqueo).
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const d = limpiar(await req.json().catch(() => ({})), "taquilla", s.nombre);
  const v = validar(d);
  if (v) return json(v, v.confirmar ? 409 : 400);

  try {
    const { data: caja, error } = await db().rpc("estado_caja", { p_taquilla: s.nombre });
    if (error) return json({ error: "No se pudo revisar la caja: " + error.message }, 500);
    if (!caja?.abierta) return json({ error: "Primero abre la caja de este puesto (botón «Abrir caja»).", caja_cerrada: true }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }

  const r = await guardarCompra(d);
  if (r.error || !r.compra) return json({ error: "Error guardando la venta: " + r.error }, 500);
  const envio = await notificarCompra(r.compra.id, origenPublico(req));
  return json({ compra: r.compra, envio });
}
