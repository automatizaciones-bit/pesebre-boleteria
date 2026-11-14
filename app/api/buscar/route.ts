import { db, json, conTokens, CompraDB } from "@/lib/db";

// Busca compras por cédula o celular (para reimprimir, reenviar o anular)
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\D/g, "");
  if (q.length < 5) return json({ error: "Escribe la cédula o el celular" }, 400);
  const { data, error } = await db()
    .from("compras")
    .select("*, boletas(*)")
    .or(`cedula.eq.${q},celular.eq.${q}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return json({ error: error.message }, 500);
  return json({ compras: await Promise.all((data as CompraDB[]).map(conTokens)) });
}
