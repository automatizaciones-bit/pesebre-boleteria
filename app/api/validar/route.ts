import { explicar, db, json, usuarioActual } from "@/lib/db";
import { verificarTokenBoleta } from "@/lib/firma";

export async function POST(req: Request) {
  const puerta = await usuarioActual();
  if (!puerta) return json({ error: "Sesión vencida" }, 401);

  const { token } = await req.json().catch(() => ({}));
  const leido = String(token ?? "").slice(0, 200);

  // 1) La firma se revisa ANTES de tocar la base de datos: un QR inventado nunca pasa.
  const codigo = await verificarTokenBoleta(leido);
  if (!codigo) {
    await Promise.resolve().then(() => db().from("escaneos").insert({ codigo: leido.slice(0, 40), resultado: "firma_invalida", puerta })).catch(() => {});
    return json({ resultado: "firma_invalida" });
  }

  // 2) Marcado atómico en la base de datos.
  try {
    const { data, error } = await db().rpc("validar_boleta", { p_codigo: codigo, p_puerta: puerta });
    if (error) return json({ resultado: "error", error: explicar(error) }, 500);
    return json(data);
  } catch (e) {
    return json({ resultado: "error", error: explicar(e) }, 500);
  }
}
