"use client";
import { useEffect, useState } from "react";

type Estado = {
  configurado: boolean; ok?: boolean; plantilla?: string; idioma?: string;
  display_phone_number?: string; verified_name?: string; name_status?: string; status?: string;
  quality_rating?: string; code_verification_status?: string; platform_type?: string; messaging_limit_tier?: string;
  error?: { message?: string };
};

const TRAD: Record<string, string> = {
  APPROVED: "✅ Aprobado", PENDING_REVIEW: "⏳ En revisión", DECLINED: "❌ Rechazado", NONE: "—",
  CONNECTED: "✅ Conectado", PENDING: "⏳ Pendiente (falta activar)", DISCONNECTED: "❌ Desconectado", FLAGGED: "⚠️ Marcado", RESTRICTED: "⚠️ Restringido",
  GREEN: "🟢 Alta", YELLOW: "🟡 Media", RED: "🔴 Baja", UNKNOWN: "— (aún sin envíos)",
  CLOUD_API: "✅ API de la nube", NOT_APPLICABLE: "⏳ Sin activar",
  VERIFIED: "✅ Verificado", NOT_VERIFIED: "⏳ Sin verificar", EXPIRED: "Vencido",
  TIER_250: "250 personas/día", TIER_1K: "1.000 personas/día", TIER_10K: "10.000 personas/día", TIER_100K: "100.000 personas/día", TIER_UNLIMITED: "Ilimitado",
};
const t = (v?: string) => (v ? TRAD[v] ?? v : "—");

export default function WhatsAppPanel() {
  const [e, setE] = useState<Estado | null>(null);
  const [pin, setPin] = useState("");
  const [cel, setCel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = () => fetch("/api/whatsapp").then((r) => r.json()).then(setE).catch(() => setE(null));
  useEffect(() => { cargar(); }, []);

  const accion = async (cuerpo: object, exito: string) => {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, txt: exito } : { ok: false, txt: d.error || "Error" });
    setOcupado(false); cargar();
  };

  return (
    <main className="contenedor pantalla">
      <h1>💬 WhatsApp automático</h1>
      {!e ? <p>Cargando…</p> : !e.configurado ? (
        <div className="aviso">Falta configurar en Vercel: <b>WHATSAPP_TOKEN</b> y <b>WHATSAPP_PHONE_ID</b> (y <b>WHATSAPP_TEMPLATE</b>, <b>WHATSAPP_LANG</b>). Luego haz Redeploy.</div>
      ) : !e.ok ? (
        <div className="error">Meta respondió con error: {e.error?.message ?? "desconocido"}. Revisa que el token y el Phone ID sean correctos.</div>
      ) : (
        <>
          <section className="tarjeta">
            <table className="grupo-tabla"><tbody>
              <tr><td>Número</td><td><b>{e.display_phone_number}</b></td></tr>
              <tr><td>Nombre visible</td><td>{e.verified_name} · {t(e.name_status)}</td></tr>
              <tr><td>Estado</td><td>{t(e.status)}</td></tr>
              <tr><td>API</td><td>{t(e.platform_type)}</td></tr>
              <tr><td>Calidad</td><td>{t(e.quality_rating)}</td></tr>
              <tr><td>Límite</td><td>{t(e.messaging_limit_tier)}</td></tr>
              <tr><td>Plantilla</td><td>{e.plantilla} ({e.idioma})</td></tr>
            </tbody></table>
          </section>

          <section className="tarjeta">
            <h2>1. Activar el número</h2>
            <p>Solo se hace una vez. Inventa un PIN de 6 dígitos y guárdalo: Meta lo usa como verificación en dos pasos del número.</p>
            <label>PIN de 6 dígitos</label>
            <input inputMode="numeric" maxLength={6} value={pin} onChange={(x) => setPin(x.target.value.replace(/\D/g, "").slice(0, 6))} />
            <button className="btn" style={{ marginTop: 10 }} disabled={ocupado || pin.length !== 6}
              onClick={() => accion({ accion: "registrar", pin }, "Número activado. Ya puede enviar mensajes.")}>Activar número</button>
          </section>

          <section className="tarjeta">
            <h2>2. Enviar mensaje de prueba</h2>
            <p>Manda la plantilla con datos de ejemplo. Funciona cuando la plantilla esté aprobada y el número activado.</p>
            <label>Celular (10 dígitos)</label>
            <input inputMode="tel" value={cel} onChange={(x) => setCel(x.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="3001234567" />
            <button className="btn wa" style={{ marginTop: 10 }} disabled={ocupado || cel.length < 10}
              onClick={() => accion({ accion: "probar", celular: cel }, "Mensaje enviado. Revisa ese WhatsApp.")}>Enviar prueba</button>
          </section>
        </>
      )}
      {msg && <div className={msg.ok ? "aviso" : "error"}>{msg.txt}</div>}
      <p style={{ marginTop: 16 }}><a href="/panel">← Volver al panel</a></p>
    </main>
  );
}
