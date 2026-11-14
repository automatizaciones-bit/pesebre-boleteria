import { cookies } from "next/headers";
import { COOKIE_SESION } from "@/lib/firma";

export async function POST() {
  (await cookies()).delete(COOKIE_SESION);
  return Response.json({ ok: true });
}
