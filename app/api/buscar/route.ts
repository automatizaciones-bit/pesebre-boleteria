import { explicar, db, json, conTokens, CompraDB, sesionActual } from "@/lib/db";

// Busca compras por cédula o celular (para reimprimir, reenviar o anular)
export async function GET(req: Request) {
  try {
  const s = await sesionActual();
  const u = new URL(req.url).searchParams;
  // Capacitación sólo ve lo suyo; el admin elige el ambiente con ?prueba=1
  const prueba = s?.prueba === true || (s?.rol === "admin" && u.get("prueba") === "1");
  const q = (u.get("q") ?? "").replace(/\D/g, "");
  if (q.length < 5) return json({ error: "Escribe la cédula o el celular" }, 400);
  const { data, error } = await db()
    .from("compras")
    .select("*, boletas(*)")
    .or(`cedula.eq.${q},celular.eq.${q}`)
    .eq("prueba", prueba)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return json({ error: explicar(error) }, 500);
  return json({ compras: await Promise.all((data as CompraDB[]).map(conTokens)) });
  } catch (e) {
    return json({ error: explicar(e) }, 500);
  }
}
