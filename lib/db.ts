import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COOKIE_SESION, leerSesion, tokenBoleta } from "./firma";

let cliente: SupabaseClient | null = null;

export function llaveServidor(): string | undefined {
  return (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
}

/** Identifica qué llave de Supabase se configuró, sin revelarla. */
export function tipoLlave(k = llaveServidor()): "secreta" | "publica" | "faltante" | "desconocida" {
  if (!k) return "faltante";
  if (k.startsWith("sb_secret_")) return "secreta";
  if (k.startsWith("sb_publishable_")) return "publica";
  const partes = k.split(".");
  if (partes.length === 3) {
    try {
      const rol = JSON.parse(Buffer.from(partes[1], "base64url").toString()).role;
      if (rol === "service_role") return "secreta";
      if (rol === "anon") return "publica";
    } catch {}
  }
  return "desconocida";
}

export const AYUDA_LLAVE =
  "La llave de Supabase configurada en Vercel es la PÚBLICA. En Vercel → Settings → Environment Variables, " +
  "SUPABASE_SERVICE_ROLE_KEY debe ser la llave que empieza por sb_secret_ (Supabase → Project Settings → API Keys → Secret keys). " +
  "Después: Deployments → Redeploy.";

/** Cliente con la llave secreta: SÓLO se usa en el servidor. */
export function db(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = llaveServidor();
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel");
    if (tipoLlave(key) === "publica") throw new Error(AYUDA_LLAVE);
    cliente = createClient(url, key, { auth: { persistSession: false } });
  }
  return cliente;
}

/** Convierte errores técnicos en mensajes que el personal entiende. */
export function explicar(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/permission denied/i.test(m)) return AYUDA_LLAVE;
  if (/Invalid API key|JWT/i.test(m)) return "La llave de Supabase en Vercel es inválida (quedó mal copiada). Cópiala de nuevo y haz Redeploy.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(m)) return "No hay conexión con la base de datos. Revisa NEXT_PUBLIC_SUPABASE_URL en Vercel.";
  return m;
}

/** Nombre del usuario (taquilla/puerta) de la sesión actual, o null. */
export async function usuarioActual(): Promise<string | null> {
  const c = await cookies();
  return leerSesion(c.get(COOKIE_SESION)?.value);
}

export type BoletaDB = {
  id: number; codigo: string; tipo: "adulto" | "nino" | "menor"; precio: number;
  fecha_visita: string; estado: string; usada_at: string | null; puerta: string | null;
};
export type CompraDB = {
  id: number; token: string; cedula: string; nombre: string; celular: string;
  fecha_visita: string; adultos: number; ninos: number; menores: number; total: number;
  metodo_pago: string; taquilla: string; anulada: boolean; created_at: string;
  boletas?: BoletaDB[];
};

/** Agrega a cada boleta el token firmado que va en el QR (nunca se guarda en la BD). */
export async function conTokens(compra: CompraDB) {
  const boletas = await Promise.all(
    (compra.boletas ?? [])
      .sort((a, b) => a.id - b.id)
      .map(async (b) => ({ ...b, token: await tokenBoleta(b.codigo) }))
  );
  return { ...compra, boletas };
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
