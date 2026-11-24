import { explicar, db, json, sesionActual } from "@/lib/db";

// Anula una compra completa (sólo administrador). Exige motivo y queda registrado quién lo hizo.
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere clave de administrador" }, 403);
  const { id, motivo } = await req.json().catch(() => ({}));
  const compraId = Number(id);
  const m = String(motivo ?? "").trim().slice(0, 200);
  if (!compraId) return json({ error: "Compra inválida" }, 400);
  if (m.length < 4) return json({ error: "Escribe el motivo de la anulación" }, 400);
  try {
    const { data, error } = await db().rpc("anular_compra", { p_id: compraId, p_por: s.nombre, p_motivo: m });
    if (error) return json({ error: explicar(error) }, 500);
    return json(data, data.ok ? 200 : 400);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
