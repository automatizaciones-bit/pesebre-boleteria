import QRCode from "qrcode";
import { db } from "@/lib/db";
import { tokenGrupo } from "@/lib/firma";

// Imagen PNG del QR de grupo de una compra (pública: la protege el token largo del enlace).
// La usan el correo y la plantilla de WhatsApp.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.png$/i, "");
  if (!/^[A-Z2-9]{16}$/.test(t)) return new Response("No encontrado", { status: 404 });
  const { data } = await db().from("compras").select("codigo, anulada").eq("token", t).maybeSingle();
  if (!data?.codigo || data.anulada) return new Response("No encontrado", { status: 404 });
  const png = await QRCode.toBuffer(await tokenGrupo(data.codigo), { width: 640, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
