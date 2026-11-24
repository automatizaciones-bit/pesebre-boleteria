import { db, json, sesionActual, explicar } from "@/lib/db";

// Arqueo de caja por puesto: GET estado · POST {accion:"abrir", base} · POST {accion:"cerrar", contado, notas}
export async function GET() {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  try {
    const { data, error } = await db().rpc("estado_caja", { p_taquilla: s.nombre });
    if (error) return json({ error: explicar(error) }, 500);
    return json({ ...data, taquilla: s.nombre });
  } catch (e) { return json({ error: explicar(e) }, 500); }
}

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const b = await req.json().catch(() => ({}));
  const monto = (v: unknown) => Math.max(0, Math.floor(Number(String(v ?? "").replace(/\D/g, "")) || 0));
  try {
    if (b.accion === "abrir") {
      const { data, error } = await db().rpc("abrir_caja", { p_taquilla: s.nombre, p_base: monto(b.base) });
      if (error) return json({ error: explicar(error) }, 500);
      return json(data, data.ok ? 200 : 400);
    }
    if (b.accion === "cerrar") {
      if (b.contado === undefined || b.contado === "") return json({ error: "Escribe el efectivo contado" }, 400);
      const { data, error } = await db().rpc("cerrar_caja", {
        p_taquilla: s.nombre, p_contado: monto(b.contado), p_notas: String(b.notas ?? "").slice(0, 300),
      });
      if (error) return json({ error: explicar(error) }, 500);
      return json(data, data.ok ? 200 : 400);
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
