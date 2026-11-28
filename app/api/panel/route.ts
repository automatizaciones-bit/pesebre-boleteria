import { explicar, db, json } from "@/lib/db";
import { hoyBogota } from "@/lib/config";

export async function GET(req: Request) {
  try {
  const f = new URL(req.url).searchParams.get("fecha") ?? hoyBogota();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return json({ error: "Fecha inválida" }, 400);
  const prueba = new URL(req.url).searchParams.get("prueba") === "1";
  const { data, error } = await db().rpc("resumen_dia", { p_fecha: f, p_prueba: prueba });
  if (error) return json({ error: explicar(error) }, 500);
  return json(data);
  } catch (e) {
    return json({ error: explicar(e) }, 500);
  }
}
