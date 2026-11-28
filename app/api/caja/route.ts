import { db, json, sesionActual, explicar } from "@/lib/db";
import { enviarCorreo, correoConfig, emailValido } from "@/lib/correo";
import { htmlCierre, textoCierre, CajaCerrada } from "@/lib/cierre";
import { enviarLibreWhatsApp, numeroAdmin } from "@/lib/whatsapp";
import { firmaPdf } from "@/lib/pdfCierre";
import { origenPublico } from "@/lib/notificar";

// Arqueo de caja por puesto:
//   GET            → estado de la caja abierta
//   GET ?historial → últimos cierres de este puesto
//   POST {accion:"abrir", base, cajero, email}
//   POST {accion:"cerrar", contado, notas}  → guarda, envía el informe al cajero y al administrador
export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  try {
    if (new URL(req.url).searchParams.has("historial")) {
      const { data, error } = await db().rpc("cierres_taquilla", { p_taquilla: s.nombre, p_limite: 10 });
      if (error) return json({ error: explicar(error) }, 500);
      return json({ cierres: data });
    }
    const { data, error } = await db().rpc("estado_caja", { p_taquilla: s.nombre });
    if (error) return json({ error: explicar(error) }, 500);
    return json({ ...data, taquilla: s.nombre });
  } catch (e) { return json({ error: explicar(e) }, 500); }
}

function linkWhatsAppAdmin(k: CajaCerrada) {
  const num = (process.env.ADMIN_WHATSAPP ?? "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  if (!/^3\d{9}$/.test(num)) return null;
  return `https://wa.me/57${num}?text=${encodeURIComponent(textoCierre(k))}`;
}

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const b = await req.json().catch(() => ({}));
  const monto = (v: unknown) => Math.max(0, Math.floor(Number(String(v ?? "").replace(/\D/g, "")) || 0));
  try {
    if (b.accion === "abrir") {
      const cajero = String(b.cajero ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
      if (cajero.length < 3) return json({ error: "Escribe el nombre de quien maneja la caja" }, 400);
      if (email && !emailValido(email)) return json({ error: "Correo inválido" }, 400);
      const { data, error } = await db().rpc("abrir_caja", { p_taquilla: s.nombre, p_base: monto(b.base), p_cajero: cajero, p_email: email });
      if (error) return json({ error: explicar(error) }, 500);
      if (data.ok && s.prueba) await db().from("cajas").update({ prueba: true }).eq("taquilla", s.nombre).is("cerrada_at", null);
      return json(data, data.ok ? 200 : 400);
    }
    if (b.accion === "cerrar") {
      if (b.contado === undefined || b.contado === "") return json({ error: "Escribe el efectivo contado" }, 400);
      const { data, error } = await db().rpc("cerrar_caja", {
        p_taquilla: s.nombre, p_contado: monto(b.contado), p_notas: String(b.notas ?? "").slice(0, 300),
      });
      if (error) return json({ error: explicar(error) }, 500);
      if (!data.ok) return json(data, 400);
      const k = data.caja as CajaCerrada;
      // Informe por correo al cajero y al administrador
      const cfg = correoConfig();
      let correo = "no configurado";
      if (cfg.activo) {
        const para = [k.email ?? "", cfg.admin].filter(emailValido);
        if (para.length === 0) correo = "sin destinatarios";
        else {
          const r = await enviarCorreo({ para, asunto: `🧮 Cierre de caja · ${k.taquilla} · ${k.cajero ?? ""}`, html: htmlCierre(k) });
          correo = r.ok ? `enviado a ${para.join(", ")}` : `error: ${r.error}`;
        }
      }
      // Informe al administrador por WhatsApp (texto + PDF), dentro de la ventana de 24 horas
      const pdf = `${origenPublico(req)}/api/cierre-pdf/${k.id}?f=${await firmaPdf(k.id)}`;
      let whatsapp = "no configurado (falta ADMIN_WHATSAPP)";
      const admin = numeroAdmin();
      if (admin) {
        const t = await enviarLibreWhatsApp(admin, { tipo: "texto", texto: textoCierre(k) });
        if (t.ok) {
          const d = await enviarLibreWhatsApp(admin, { tipo: "documento", link: pdf, nombre: `cierre-caja-${k.id}-${(k.cajero ?? k.taquilla).replace(/[^\w-]+/g, "_")}.pdf`, leyenda: `Cierre de caja N.° ${k.id} · ${k.cajero ?? k.taquilla}` });
          whatsapp = d.ok ? "enviado al administrador (texto y PDF)" : `texto enviado; PDF: ${d.error}`;
        } else whatsapp = t.ventana_cerrada
          ? "no enviado: el administrador debe escribirle «hola» al WhatsApp del Pesebre (se abre la ventana de 24 h). Usa el botón para enviarlo a mano."
          : `error: ${t.error}`;
      }
      return json({ ...data, envio: { correo, whatsapp }, pdf, whatsapp_admin: linkWhatsAppAdmin(k), texto: textoCierre(k) });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
