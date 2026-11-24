import { cookies } from "next/headers";
import { COOKIE_SESION, crearSesion, Rol } from "@/lib/firma";
import { json } from "@/lib/db";

// Dos claves: ACCESS_PASSWORD (personal: vender y escanear) y ADMIN_PASSWORD
// (administración: panel, anulaciones, cortesías, exportar).
export async function POST(req: Request) {
  const { clave, nombre } = await req.json().catch(() => ({}));
  const n = String(nombre ?? "").trim().slice(0, 40);
  if (!n) return json({ error: "Escribe el nombre del puesto (ej: Taquilla 1)" }, 400);
  const c = String(clave ?? "");
  let rol: Rol | null = null;
  if (process.env.ADMIN_PASSWORD && c === process.env.ADMIN_PASSWORD) rol = "admin";
  else if (process.env.ACCESS_PASSWORD && c === process.env.ACCESS_PASSWORD) rol = "personal";
  if (!rol) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    return json({ error: "Clave incorrecta" }, 401);
  }
  (await cookies()).set(COOKIE_SESION, await crearSesion(n, rol), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 16, // un turno largo
  });
  const destino = /puerta|porter/i.test(n) ? "/porteria" : rol === "admin" && /admin/i.test(n) ? "/panel" : "/taquilla";
  return json({ ok: true, rol, destino });
}
