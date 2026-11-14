import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COOKIE_SESION, leerSesion, tokenBoleta } from "./firma";

let cliente: SupabaseClient | null = null;

/** Cliente con service_role: SÓLO se usa en el servidor. */
export function db(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    cliente = createClient(url, key, { auth: { persistSession: false } });
  }
  return cliente;
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
