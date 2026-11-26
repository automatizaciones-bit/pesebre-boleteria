import { db, json, sesionActual, explicar } from "@/lib/db";

// Administrador confirma (o rechaza) un pago por Nequi, Bancolombia, Daviplata u otro banco.
// Rechazar anula la compra: su QR deja de servir en la puerta.
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere clave de administrador" }, 403);
  const { id, ok, motivo } = await req.json().catch(() => ({}));
  if (!Number(id) || typeof ok !== "boolean") return json({ error: "Datos inválidos" }, 400);
  if (!ok && String(motivo ?? "").trim().length < 4) return json({ error: "Escribe por qué se rechaza el pago" }, 400);
  try {
    const { data, error } = await db().rpc("verificar_pago", { p_id: Number(id), p_ok: ok, p_por: s.nombre, p_motivo: String(motivo ?? "").slice(0, 200) });
    if (error) return json({ error: explicar(error) }, 500);
    return json(data, data.ok ? 200 : 400);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
