import { db, json } from "@/lib/db";
import { hoyBogota } from "@/lib/config";

export async function GET(req: Request) {
  const f = new URL(req.url).searchParams.get("fecha") ?? hoyBogota();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return json({ error: "Fecha inválida" }, 400);
  const { data, error } = await db().rpc("resumen_dia", { p_fecha: f });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}
