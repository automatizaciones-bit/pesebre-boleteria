import { explicar, db, json, sesionActual } from "@/lib/db";
import { verificarToken } from "@/lib/firma";

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const puerta = s.nombre;

  const { token } = await req.json().catch(() => ({}));
  const leido = String(token ?? "").slice(0, 200);

  // 1) La firma se revisa ANTES de tocar la base de datos: un QR inventado nunca pasa.
  const v = await verificarToken(leido);
  if (!v) {
    await Promise.resolve().then(() => db().from("escaneos").insert({ codigo: leido.slice(0, 40), resultado: "firma_invalida", puerta, prueba: s.prueba })).catch(() => {});
    return json({ resultado: "firma_invalida" });
  }

  // 2) Marcado atómico en la base de datos.
  try {
    // Las boletas individuales (formato antiguo) son todas reales: en capacitación no se tocan.
    if (v.tipo === "boleta" && s.prueba) return json({ resultado: "es_real" });
    const { data, error } = v.tipo === "grupo"
      ? await db().rpc("validar_grupo", { p_codigo: v.codigo, p_puerta: puerta, p_prueba: s.prueba })
      : await db().rpc("validar_boleta", { p_codigo: v.codigo, p_puerta: puerta });
    if (error) return json({ resultado: "error", error: explicar(error) }, 500);
    return json(data);
  } catch (e) {
    return json({ resultado: "error", error: explicar(e) }, 500);
  }
}
