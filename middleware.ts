import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion } from "./lib/firma";

// Rutas sólo para administración
const SOLO_ADMIN = [/^\/panel/, /^\/cortesias/, /^\/api\/panel/, /^\/api\/anular/, /^\/api\/cortesias/, /^\/api\/exportar/, /^\/api\/config/, /^\/api\/verificar/];

export async function middleware(req: NextRequest) {
  const s = await leerSesion(req.cookies.get(COOKIE_SESION)?.value);
  const ruta = req.nextUrl.pathname;
  const esApi = ruta.startsWith("/api/");

  if (!s) {
    if (esApi) return NextResponse.json({ error: "Sesión vencida. Vuelve a ingresar." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (s.rol !== "admin" && SOLO_ADMIN.some((r) => r.test(ruta))) {
    if (esApi) return NextResponse.json({ error: "Esta acción requiere la clave de administrador." }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/taquilla";
    url.search = "?sin_permiso=1";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Públicas: login, salud, boletas del cliente (/c/), compra en línea, privacidad
export const config = {
  matcher: ["/((?!login|api/login|api/salud|api/online|api/qr|c/|comprar|privacidad|_next/|logo|icon|favicon).*)"],
};
