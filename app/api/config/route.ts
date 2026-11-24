import { db, json, sesionActual, explicar } from "@/lib/db";

// Configuración editable por el administrador (por ahora: tope de cortesías)
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere clave de administrador" }, 403);
  const { tope_cortesias } = await req.json().catch(() => ({}));
  const n = Math.floor(Number(tope_cortesias));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return json({ error: "Tope inválido" }, 400);
  try {
    const { error } = await db().from("config")
      .upsert({ clave: "tope_cortesias", valor: String(n), updated_at: new Date().toISOString(), updated_by: s.nombre });
    if (error) return json({ error: explicar(error) }, 500);
    return json({ ok: true, tope_cortesias: n });
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
