import { cookies } from "next/headers";
import { COOKIE_SESION, crearSesion, Rol } from "@/lib/firma";
import { db, json } from "@/lib/db";
import { buscarUsuario, claveCorrecta, rolSesion } from "@/lib/usuarios";

// Ingreso:
//  1) Usuario individual (tabla usuarios): nombre + su propia clave.
//  2) Respaldo: claves generales ACCESS_PASSWORD (personal) y ADMIN_PASSWORD (admin)
//     con un nombre de puesto. Un nombre que pertenezca a un usuario NO puede usar las claves generales.
export async function POST(req: Request) {
  const { clave, nombre } = await req.json().catch(() => ({}));
  const n = String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!n) return json({ error: "Escribe tu usuario (o el nombre del puesto)" }, 400);
  const c = String(clave ?? "");

  let rol: Rol | null = null;
  let prueba = false;
  let nombreSesion = n;

  const u = await buscarUsuario(n).catch(() => null);
  if (u) {
    if (!u.activo) return json({ error: "Este usuario está desactivado. Habla con el administrador." }, 403);
    if (await claveCorrecta(c, u.clave_hash)) {
      rol = rolSesion(u.rol);
      prueba = u.prueba;
      nombreSesion = u.nombre;
      await db().from("usuarios").update({ ultimo_ingreso: new Date().toISOString() }).eq("id", u.id);
    }
  } else if (process.env.ADMIN_PASSWORD && c === process.env.ADMIN_PASSWORD) rol = "admin";
  else if (process.env.ACCESS_PASSWORD && c === process.env.ACCESS_PASSWORD) rol = "personal";

  if (!rol) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    return json({ error: u ? "Clave incorrecta" : "Usuario o clave incorrectos" }, 401);
  }
  (await cookies()).set(COOKIE_SESION, await crearSesion(nombreSesion, rol, prueba), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 16, // un turno largo
  });
  const destino = rol === "portero" || /puerta|porter/i.test(n) ? "/porteria"
    : rol === "admin" && (u || /admin/i.test(n)) ? "/panel" : "/taquilla";
  return json({ ok: true, rol, prueba, destino });
}
