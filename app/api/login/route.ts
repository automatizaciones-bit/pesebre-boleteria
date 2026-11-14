import { cookies } from "next/headers";
import { COOKIE_SESION, crearSesion } from "@/lib/firma";
import { json } from "@/lib/db";

export async function POST(req: Request) {
  const { clave, nombre } = await req.json().catch(() => ({}));
  const n = String(nombre ?? "").trim().slice(0, 40);
  if (!n) return json({ error: "Escribe el nombre del puesto (ej: Taquilla 1)" }, 400);
  if (!process.env.ACCESS_PASSWORD || clave !== process.env.ACCESS_PASSWORD) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    return json({ error: "Clave incorrecta" }, 401);
  }
  (await cookies()).set(COOKIE_SESION, await crearSesion(n), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 16, // un turno largo
  });
  return json({ ok: true, destino: /puerta|porter/i.test(n) ? "/porteria" : "/taquilla" });
}
