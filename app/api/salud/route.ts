import { createClient } from "@supabase/supabase-js";
import { llaveServidor, tipoLlave, explicar } from "@/lib/db";
import { hoyBogota } from "@/lib/config";

export const dynamic = "force-dynamic";

// Chequeo de salud PÚBLICO: dice si la configuración está bien, sin revelar ninguna clave.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const llave = tipoLlave();
  const qr = (process.env.QR_SECRET ?? "").length >= 16;
  const clave = !!process.env.ACCESS_PASSWORD;
  const problemas: string[] = [];

  if (!url) problemas.push("Falta NEXT_PUBLIC_SUPABASE_URL en Vercel.");
  if (llave === "faltante") problemas.push("Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.");
  if (llave === "publica") problemas.push("SUPABASE_SERVICE_ROLE_KEY tiene la llave PÚBLICA (sb_publishable_). Debe ser la que empieza por sb_secret_.");
  if (!qr) problemas.push("QR_SECRET falta o es muy corto (mínimo 16 caracteres).");
  if (!clave) problemas.push("Falta ACCESS_PASSWORD en Vercel.");

  let baseDatos = "sin probar";
  if (url && (llave === "secreta" || llave === "desconocida")) {
    try {
      const c = createClient(url, llaveServidor()!, { auth: { persistSession: false } });
      const { error } = await c.rpc("resumen_dia", { p_fecha: hoyBogota() });
      baseDatos = error ? "error" : "ok";
      if (error) problemas.push("Base de datos: " + explicar(error));
    } catch (e) {
      baseDatos = "error";
      problemas.push("Base de datos: " + explicar(e));
    }
  }

  return Response.json({
    ok: problemas.length === 0,
    llave_supabase: llave,
    base_de_datos: baseDatos,
    qr_secret: qr ? "ok" : "falta",
    clave_personal: clave ? "ok" : "falta",
    modo_prueba: process.env.MODO_PRUEBA === "1",
    problemas,
  }, { headers: { "Cache-Control": "no-store" } });
}
