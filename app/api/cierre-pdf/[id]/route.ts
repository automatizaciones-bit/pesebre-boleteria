import { db } from "@/lib/db";
import { igualTexto } from "@/lib/firma";
import { firmaPdf, pdfCierre } from "@/lib/pdfCierre";
import type { CajaCerrada } from "@/lib/cierre";

export const dynamic = "force-dynamic";

// PÚBLICA pero firmada: /api/cierre-pdf/<id>?f=<firma>. Meta la descarga para enviar el PDF por WhatsApp.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const f = new URL(req.url).searchParams.get("f") ?? "";
  if (!id || !igualTexto(f, await firmaPdf(id))) return new Response("No autorizado", { status: 403 });
  const { data } = await db().from("cajas").select("*").eq("id", id).not("cerrada_at", "is", null).maybeSingle();
  if (!data) return new Response("No existe", { status: 404 });
  const k = data as CajaCerrada;
  const pdf = await pdfCierre(k);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cierre-caja-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
