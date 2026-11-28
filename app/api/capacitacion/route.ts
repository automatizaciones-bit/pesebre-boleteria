import { db, json, sesionActual, explicar } from "@/lib/db";

// Sólo administrador: borra TODOS los datos de capacitación (ventas, boletas, escaneos y cajas de práctica).
// Nunca toca datos reales: la base de datos filtra por la marca "prueba".
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere administrador" }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.confirmar !== "BORRAR") return json({ error: "Confirma escribiendo BORRAR" }, 400);
  try {
    const { data, error } = await db().rpc("borrar_capacitacion");
    if (error) return json({ error: explicar(error) }, 500);
    return json(data);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
