import QRCode from "qrcode";
import { db, conTokens, CompraDB } from "./db";
import { enviarCorreo, correoConfig, plantillaCorreo, esc, emailValido } from "./correo";
import { enviarPlantillaWhatsApp, whatsappConfig } from "./whatsapp";
import { fechaLarga, pesos, precios } from "./config";
import { NOMBRE_METODO } from "./cierre";

export type ResultadoEnvio = { correo: string; whatsapp: string };

/** Detalle del recibo con valores: "2 adultos × $40.000 = $80.000 · 1 niño (6-14) × $20.000 = $20.000" */
export function detalleRecibo(c: { canal?: string; adultos: number; ninos: number; menores: number; boletas?: { tipo: string; precio: number }[] }) {
  if (c.canal === "cortesia") return `Cortesía sin costo · ${grupoTexto(c)}`;
  const unit = (tipo: string, def: number) => c.boletas?.find((b) => b.tipo === tipo)?.precio ?? def;
  const p = precios();
  const partes: string[] = [];
  if (c.adultos) { const u = unit("adulto", p.adulto); partes.push(`${c.adultos} adulto${c.adultos > 1 ? "s" : ""} ${pesos(u * c.adultos)}`); }
  if (c.ninos) { const u = unit("nino", p.nino); partes.push(`${c.ninos} niño${c.ninos > 1 ? "s" : ""} ${pesos(u * c.ninos)}`); }
  if (c.menores) partes.push(`${c.menores} menor${c.menores > 1 ? "es" : ""} de 6 gratis`);
  return partes.join(" · ");
}

/** Una casilla por tipo, para que el WhatsApp se vea como tabla. */
export function filasRecibo(c: { canal?: string; adultos: number; ninos: number; menores: number; boletas?: { tipo: string; precio: number }[] }) {
  const p = precios();
  const unit = (tipo: string, def: number) => c.boletas?.find((b) => b.tipo === tipo)?.precio ?? def;
  const fila = (n: number, tipo: string, def: number) =>
    !n ? "0" : c.canal === "cortesia" ? `${n} (cortesía)` : `${n} × ${pesos(unit(tipo, def))} = ${pesos(unit(tipo, def) * n)}`;
  return { adultos: fila(c.adultos, "adulto", p.adulto), ninos: fila(c.ninos, "nino", p.nino), menores: c.menores ? `${c.menores} (gratis)` : "0" };
}

function grupoTexto(c: { adultos: number; ninos: number; menores: number }) {
  return [
    c.adultos ? `${c.adultos} adulto${c.adultos > 1 ? "s" : ""}` : "",
    c.ninos ? `${c.ninos} niño${c.ninos > 1 ? "s" : ""} (6-14)` : "",
    c.menores ? `${c.menores} menor${c.menores > 1 ? "es" : ""} de 6` : "",
  ].filter(Boolean).join(", ");
}

export function origenPublico(req: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/$/, "") || new URL(req.url).origin;
}

/**
 * Envía la entrada (QR de grupo) por correo y/o WhatsApp, si están configurados.
 * Nunca lanza error: una falla de envío no debe tumbar una venta.
 */
export async function notificarCompra(compraId: number, origen: string): Promise<ResultadoEnvio> {
  const res: ResultadoEnvio = { correo: "no configurado", whatsapp: "no configurado" };
  try {
    const { data } = await db().from("compras").select("*, boletas(*)").eq("id", compraId).single();
    if (!data) return res;
    const c = await conTokens(data as CompraDB);
    if (c.anulada || c.estado_pago !== "pagado" || !c.qr) return { correo: "no aplica", whatsapp: "no aplica" };
    const enlace = `${origen}/c/${c.token}`;
    const imagenUrl = `${origen}/api/qr/${c.token}`;
    const grupo = grupoTexto(c);
    const n = c.adultos + c.ninos + c.menores;

    // ---- Correo ----
    if (correoConfig().activo) {
      if (!emailValido(c.email)) res.correo = "sin correo";
      else if (c.email_enviado_at) res.correo = "ya enviado";
      else {
        const png = await QRCode.toBuffer(c.qr, { width: 640, margin: 2, errorCorrectionLevel: "M" });
        const html = plantillaCorreo(c.canal === "cortesia" ? "Tu cortesía" : "Tu entrada", `
          <p>Hola <b>${esc(c.nombre.split(" ")[0])}</b>${c.canal === "cortesia" ? ", tienes una <b>cortesía</b> para visitarnos." : ", ¡gracias por tu compra!"}</p>
          <p>📅 <b>${esc(fechaLarga(c.fecha_visita))}</b><br>👨‍👩‍👧 ${n > 1 ? `Grupo de <b>${n} personas</b>` : "<b>1 persona</b>"}: ${esc(grupo)}
          ${c.canal === "cortesia" ? "" : `<br>💳 Total: <b>${esc(pesos(c.total))}</b>`}</p>
          <div style="background:#fff;border-radius:12px;padding:12px;width:260px;margin:16px auto"><img src="${esc(imagenUrl)}" width="260" height="260" alt="Código QR" style="display:block"></div>
          <p style="text-align:center"><a href="${esc(enlace)}" style="background:#e8b33a;color:#1a1205;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Ver mi entrada</a></p>
          <p style="font-size:13px;color:#a9b0cc">Muestra el QR en la entrada (desde el celular o impreso).${n > 1 ? " Todo el grupo entra junto con un solo escaneo." : ""}
          Sirve una sola vez y solo para la fecha indicada. El QR también va adjunto a este correo.</p>`);
        const r = await enviarCorreo({
          para: [c.email!], asunto: `🎄 Tu entrada · Pesebre Tenjo · ${fechaLarga(c.fecha_visita)}`, html,
          adjuntos: [{ filename: `entrada-pesebre-${c.id}.png`, content: png.toString("base64") }],
        });
        res.correo = r.ok ? "enviado" : `error: ${r.error}`;
        if (r.ok) await db().from("compras").update({ email_enviado_at: new Date().toISOString() }).eq("id", c.id);
      }
    }

    // ---- WhatsApp automático ----
    if (whatsappConfig().activo) {
      if (c.whatsapp_enviado_at) res.whatsapp = "ya enviado";
      else {
        const r = await enviarPlantillaWhatsApp({
          celular: c.celular, imagenUrl, nombre: c.nombre.split(" ")[0], fecha: fechaLarga(c.fecha_visita), grupo, enlace,
          detalle: detalleRecibo(c), total: c.canal === "cortesia" ? "$0" : pesos(c.total),
          metodo: NOMBRE_METODO[c.metodo_pago] ?? c.metodo_pago, recibo: String(c.id),
        });
        res.whatsapp = r.ok ? "enviado" : `error: ${r.error}`;
        if (r.ok) await db().from("compras").update({ whatsapp_enviado_at: new Date().toISOString() }).eq("id", c.id);
      }
    }
  } catch (e) {
    res.correo = res.correo === "no configurado" ? res.correo : `error: ${String((e as Error).message ?? e)}`;
  }
  return res;
}
