import { createClient } from "@supabase/supabase-js";
import { llaveServidor, tipoLlave, explicar } from "@/lib/db";
import { hoyBogota } from "@/lib/config";
import { wompi } from "@/lib/wompi";
import { correoConfig } from "@/lib/correo";
import { whatsappConfig } from "@/lib/whatsapp";

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
  const admin = !!process.env.ADMIN_PASSWORD;
  if (!admin) problemas.push("Falta ADMIN_PASSWORD en Vercel (clave de administrador para panel, anulaciones y cortesías).");
  if (admin && process.env.ADMIN_PASSWORD === process.env.ACCESS_PASSWORD) problemas.push("ADMIN_PASSWORD debe ser distinta de ACCESS_PASSWORD.");

  let baseDatos = "sin probar";
  if (url && (llave === "secreta" || llave === "desconocida")) {
    try {
      const c = createClient(url, llaveServidor()!, { auth: { persistSession: false } });
      const { error } = await c.rpc("resumen_dia", { p_fecha: hoyBogota() });
      const { error: e2 } = await c.rpc("estado_caja", { p_taquilla: "_salud_" });
      const { error: e3 } = await c.rpc("cierres_taquilla", { p_taquilla: "_salud_", p_limite: 1 });
      baseDatos = error || e2 || e3 ? "error" : "ok";
      if (error) problemas.push("Base de datos: " + explicar(error));
      else if (e2) problemas.push("Falta ejecutar supabase/migracion-002.sql en Supabase (SQL Editor).");
      else if (e3) problemas.push("Falta ejecutar supabase/migracion-003.sql en Supabase (SQL Editor).");
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
    clave_admin: admin ? "ok" : "falta",
    venta_online: wompi().activo ? (wompi().sandbox ? "activa (pruebas)" : "activa") : "desactivada",
    correo_automatico: correoConfig().activo ? (correoConfig().admin ? "activo" : "activo (falta ADMIN_EMAIL)") : "desactivado",
    whatsapp_automatico: whatsappConfig().activo ? "activo" : "desactivado",
    problemas,
  }, { headers: { "Cache-Control": "no-store" } });
}
