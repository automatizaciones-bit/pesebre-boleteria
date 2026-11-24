// Firma HMAC de los códigos QR y de la sesión del personal.
// Usa Web Crypto, así funciona igual en el middleware (edge) y en las rutas API.
//
// Formato del QR:  PT + CODIGO(10) + FIRMA(8)  → 20 caracteres alfanuméricos.
// Sin guiones ni símbolos a propósito: los lectores USB "escriben" como un teclado
// y con distribución de teclado latinoamericana los símbolos pueden cambiar.

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 caracteres, sin I, O, 0, 1
const enc = new TextEncoder();
let llaveCache: Promise<CryptoKey> | null = null;

function secreto(): string {
  const s = process.env.QR_SECRET;
  if (!s || s.length < 16) throw new Error("QR_SECRET no está configurado (mínimo 16 caracteres)");
  return s;
}

function llave(): Promise<CryptoKey> {
  if (!llaveCache) {
    llaveCache = crypto.subtle.importKey(
      "raw", enc.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
  }
  return llaveCache;
}

function base32(bytes: Uint8Array): string {
  let out = "", bits = 0, val = 0;
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export async function firmar(dato: string, largo = 8): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await llave(), enc.encode(dato)));
  return base32(sig).slice(0, largo);
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function aleatorio(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (x) => ALFABETO[x & 31]).join("");
}

// ---------- Boletas ----------
export async function tokenBoleta(codigo: string): Promise<string> {
  return `PT${codigo}${await firmar("B" + codigo)}`;
}

/** Devuelve el código si el QR es auténtico, o null si es falso / está mal leído. */
export async function verificarTokenBoleta(entrada: string): Promise<string | null> {
  const t = entrada.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length !== 20 || !t.startsWith("PT")) return null;
  const codigo = t.slice(2, 12);
  const sig = t.slice(12);
  return igual(sig, await firmar("B" + codigo)) ? codigo : null;
}

/** Agrupa el token en bloques para leerlo/digitarlo a mano: PTAB CDEF ... */
export function tokenLegible(token: string): string {
  return token.replace(/(.{4})/g, "$1 ").trim();
}

// ---------- Sesión del personal ----------
export const COOKIE_SESION = "pt_sesion";
export type Rol = "admin" | "personal";
export type Sesion = { nombre: string; rol: Rol };

export async function crearSesion(nombre: string, rol: Rol): Promise<string> {
  const cuerpo = `${encodeURIComponent(nombre)}~${rol}`;
  return `${cuerpo}.${await firmar("S" + cuerpo, 22)}`;
}

export async function leerSesion(valor: string | undefined): Promise<Sesion | null> {
  if (!valor) return null;
  const i = valor.lastIndexOf(".");
  if (i < 1) return null;
  const cuerpo = valor.slice(0, i);
  if (!igual(valor.slice(i + 1), await firmar("S" + cuerpo, 22))) return null;
  const [n, rol] = cuerpo.split("~");
  if (rol !== "admin" && rol !== "personal") return null;
  try { return { nombre: decodeURIComponent(n), rol }; } catch { return null; }
}
