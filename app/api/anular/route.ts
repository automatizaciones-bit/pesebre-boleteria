import { explicar, db, json, usuarioActual } from "@/lib/db";

// Anula una compra completa: sus boletas que no se han usado dejan de servir.
export async function POST(req: Request) {
  try {
  const usuario = await usuarioActual();
  const { id } = await req.json().catch(() => ({}));
  const compraId = Number(id);
  if (!compraId) return json({ error: "Compra inválida" }, 400);

  const { error: e1 } = await db().from("compras")
    .update({ anulada: true, anulada_at: new Date().toISOString() })
    .eq("id", compraId).eq("anulada", false);
  if (e1) return json({ error: e1.message }, 500);

  const { error: e2 } = await db().from("boletas")
    .update({ estado: "anulada" }).eq("compra_id", compraId).eq("estado", "valida");
  if (e2) return json({ error: e2.message }, 500);

  await db().from("escaneos").insert({ codigo: `compra:${compraId}`, resultado: "compra_anulada", puerta: usuario });
  return json({ ok: true });
  } catch (e) {
    return json({ error: explicar(e) }, 500);
  }
}
