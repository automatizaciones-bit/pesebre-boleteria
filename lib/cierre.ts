import { pesos } from "./config";
import { esc, plantillaCorreo } from "./correo";

export const NOMBRE_METODO: Record<string, string> = {
  efectivo: "Efectivo", datafono: "Datáfono", nequi: "Nequi", bancolombia: "Bancolombia", daviplata: "Daviplata",
  transferencia: "Otro banco", qr: "QR", cortesia: "Cortesía", online: "En línea",
};

type Metodo = { compras: number; total: number; boletas?: number };
export type ResumenCaja = {
  cajero?: string | null; boletas?: number; total?: number; compras?: number; anuladas?: number; anuladas_total?: number;
  por_metodo?: Record<string, Metodo>; por_tipo?: { adultos: number; ninos: number; menores: number };
  por_verificar?: { compras: number; total: number }; primera_venta?: string | null; ultima_venta?: string | null;
};
export type CajaCerrada = {
  id: number; taquilla: string; cajero?: string | null; email?: string | null; base: number; abierta_at: string; cerrada_at: string;
  efectivo_sistema: number; contado: number; diferencia: number; notas?: string | null; resumen?: ResumenCaja | null;
};

const hora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";
const dif = (n: number) => (n === 0 ? "$0 (cuadra)" : n > 0 ? `+${pesos(n)} (sobra)` : `-${pesos(-n)} (falta)`);

/** Texto plano del cierre (WhatsApp). */
export function textoCierre(k: CajaCerrada) {
  const r = k.resumen ?? {};
  const metodos = Object.entries(r.por_metodo ?? {}).map(([m, v]) => `• ${NOMBRE_METODO[m] ?? m}: ${v.compras} pago(s) · ${pesos(v.total)}`).join("\n");
  return `🧮 *CIERRE DE CAJA · ${k.taquilla}*
Cajero: ${k.cajero ?? "—"}
${hora(k.abierta_at)} → ${hora(k.cerrada_at)}

${metodos || "• Sin ventas"}
*Total vendido: ${pesos(r.total ?? 0)}* (${r.compras ?? 0} compras · ${r.boletas ?? 0} personas)
Anuladas: ${r.anuladas ?? 0} · ${pesos(r.anuladas_total ?? 0)}
Por verificar (Nequi/banco): ${r.por_verificar?.compras ?? 0} · ${pesos(r.por_verificar?.total ?? 0)}

Base: ${pesos(k.base)}
+ Efectivo vendido: ${pesos(k.efectivo_sistema)}
= Debe haber: ${pesos(k.base + k.efectivo_sistema)}
Contado: ${pesos(k.contado)}
*Diferencia: ${dif(k.diferencia)}*${k.notas ? `\nNotas: ${k.notas}` : ""}`;
}

/** HTML del cierre (correo). */
export function htmlCierre(k: CajaCerrada) {
  const r = k.resumen ?? {};
  const fila = (a: string, b: string, fuerte = false) =>
    `<tr><td style="padding:6px 0;color:#a9b0cc">${esc(a)}</td><td style="padding:6px 0;text-align:right;${fuerte ? "font-weight:bold;color:#ffd97a" : ""}">${esc(b)}</td></tr>`;
  const metodos = Object.entries(r.por_metodo ?? {})
    .map(([m, v]) => fila(`${NOMBRE_METODO[m] ?? m} (${v.compras} pago${v.compras === 1 ? "" : "s"})`, pesos(v.total))).join("");
  const color = k.diferencia === 0 ? "#5ee28f" : "#ff8b8b";
  return plantillaCorreo(`Cierre de caja · ${k.taquilla}`, `
    <p style="margin-top:0">Cajero: <b>${esc(k.cajero ?? "—")}</b><br><span style="color:#a9b0cc">${esc(hora(k.abierta_at))} → ${esc(hora(k.cerrada_at))}</span></p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${metodos || fila("Sin ventas", "$0")}
      ${fila("Total vendido", pesos(r.total ?? 0), true)}
      ${fila("Compras / personas", `${r.compras ?? 0} / ${r.boletas ?? 0}`)}
      ${fila("Adultos · Niños · Menores", `${r.por_tipo?.adultos ?? 0} · ${r.por_tipo?.ninos ?? 0} · ${r.por_tipo?.menores ?? 0}`)}
      ${fila("Ventas anuladas", `${r.anuladas ?? 0} · ${pesos(r.anuladas_total ?? 0)}`)}
      ${fila("Pagos por verificar (Nequi/banco)", `${r.por_verificar?.compras ?? 0} · ${pesos(r.por_verificar?.total ?? 0)}`)}
    </table>
    <hr style="border:0;border-top:1px dashed #6b5420;margin:14px 0">
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${fila("Base inicial", pesos(k.base))}
      ${fila("+ Efectivo vendido", pesos(k.efectivo_sistema))}
      ${fila("= Debe haber", pesos(k.base + k.efectivo_sistema), true)}
      ${fila("Efectivo contado", pesos(k.contado))}
    </table>
    <p style="font-size:20px;text-align:center;margin:16px 0 4px;color:${color}"><b>Diferencia: ${esc(dif(k.diferencia))}</b></p>
    ${k.notas ? `<p style="color:#a9b0cc">Notas: ${esc(k.notas)}</p>` : ""}`);
}
