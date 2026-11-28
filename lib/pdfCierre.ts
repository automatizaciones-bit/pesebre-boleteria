import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CajaCerrada, lineasCierre } from "./cierre";
import { firmar } from "./firma";
import { EVENTO_NOMBRE } from "./config";

/** Firma del enlace público del PDF (Meta lo descarga para mandarlo por WhatsApp). */
export const firmaPdf = (id: number) => firmar("C" + id, 16);

// Las fuentes estándar del PDF sólo tienen caracteres latinos: se quitan emojis y símbolos raros.
const limpio = (t: string) => t.replace(/[→]/g, "->").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

export async function pdfCierre(k: CajaCerrada): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pag = doc.addPage([420, 640]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = pag.getSize();
  let y = 600;
  const izq = 32, der = width - 32;
  pag.drawText(limpio(EVENTO_NOMBRE), { x: izq, y, size: 11, font: f, color: rgb(0.35, 0.35, 0.4) });
  y -= 24;
  pag.drawText(limpio(`Cierre de caja N. ${k.id}`), { x: izq, y, size: 18, font: fb });
  y -= 10;
  pag.drawLine({ start: { x: izq, y }, end: { x: der, y }, thickness: 1, color: rgb(0.8, 0.65, 0.2) });
  y -= 20;
  for (const l of lineasCierre(k)) {
    if (!l.t && !l.der) { y -= 8; continue; }
    const fuente = l.fuerte ? fb : f;
    const color = l.t === "Diferencia" ? (k.diferencia === 0 ? rgb(0.1, 0.55, 0.25) : rgb(0.8, 0.15, 0.15)) : rgb(0, 0, 0);
    pag.drawText(limpio(l.t), { x: izq, y, size: 11, font: fuente, color });
    if (l.der) {
      const t = limpio(l.der);
      pag.drawText(t, { x: der - fuente.widthOfTextAtSize(t, 11), y, size: 11, font: fuente, color });
    }
    y -= 17;
    if (y < 40) break;
  }
  pag.drawText(limpio(`Generado ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`), { x: izq, y: 24, size: 8, font: f, color: rgb(0.5, 0.5, 0.5) });
  doc.setTitle(`Cierre de caja ${k.id} - ${k.cajero ?? k.taquilla}`);
  return doc.save();
}
