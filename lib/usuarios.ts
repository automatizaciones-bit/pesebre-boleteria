import { db } from "./db";
import type { Rol } from "./firma";

// Usuarios individuales. La clave se guarda con PBKDF2-SHA256 (nunca en texto).
export type RolUsuario = "vendedor" | "portero" | "admin";
export type Usuario = {
  id: number; nombre: string; rol: RolUsuario; prueba: boolean; activo: boolean;
  celular: string | null; creado_por: string | null; created_at: string; ultimo_ingreso: string | null;
};

const ITER = 120_000;
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64")) as Uint8Array<ArrayBuffer>;

async function derivar(clave: string, sal: Uint8Array, iter: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal as Uint8Array<ArrayBuffer>, iterations: iter }, k, 256));
}

export async function hashClave(clave: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(sal)}$${b64(await derivar(clave, sal, ITER))}`;
}

export async function claveCorrecta(clave: string, guardado: string): Promise<boolean> {
  const [alg, iter, sal, hash] = guardado.split("$");
  if (alg !== "pbkdf2" || !iter || !sal || !hash) return false;
  const a = await derivar(clave, deB64(sal), Number(iter));
  const b = deB64(hash);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export const rolSesion = (r: RolUsuario): Rol => (r === "admin" ? "admin" : r === "portero" ? "portero" : "personal");

export function validarClave(clave: string): string | null {
  if (clave.length < 6) return "La clave debe tener mínimo 6 caracteres";
  if (clave.length > 64) return "Clave demasiado larga";
  return null;
}

export const limpiarNombre = (n: unknown) => String(n ?? "").trim().replace(/\s+/g, " ").slice(0, 40);

/** Busca un usuario por nombre sin importar mayúsculas. Devuelve null si la tabla aún no existe. */
export async function buscarUsuario(nombre: string): Promise<(Usuario & { clave_hash: string }) | null> {
  const { data, error } = await db().from("usuarios").select("*").ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (error || !data?.length) return null;
  return data[0] as Usuario & { clave_hash: string };
}

/** Clave fácil de dictar: 6 dígitos sin patrones obvios. */
export function claveAleatoria(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
  return String(n);
}
