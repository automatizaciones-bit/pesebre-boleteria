import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion } from "./lib/firma";

// Todo requiere sesión del personal, excepto el login y la página pública de boletas (/c/...)
export async function middleware(req: NextRequest) {
  const usuario = await leerSesion(req.cookies.get(COOKIE_SESION)?.value);
  if (usuario) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesión vencida. Vuelve a ingresar." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|api/salud|c/|_next/|logo|icon|favicon).*)"],
};
