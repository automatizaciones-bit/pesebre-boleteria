"use client";
import { useState } from "react";
import { fechaLarga, pesos } from "@/lib/config";

type Precios = { adulto: number; nino: number; menor: number };

function Fila({ t, s, v, set }: { t: string; s: string; v: number; set: (n: number) => void }) {
  return (
    <div className="contador">
      <div className="tipo"><b>{t}</b><span>{s}</span></div>
      <div className="ctrl">
        <button type="button" onClick={() => set(Math.max(0, v - 1))}>−</button>
        <input inputMode="numeric" value={v} readOnly />
        <button type="button" onClick={() => set(Math.min(10, v + 1))}>+</button>
      </div>
    </div>
  );
}

export default function Comprar({ activo, precios, fechas }: { activo: boolean; precios: Precios; fechas: string[] }) {
  const [f, setF] = useState({ cedula: "", nombre: "", celular: "", email: "", fecha: fechas[0] ?? "", sitio_web: "" });
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [menores, setMenores] = useState(0);
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const total = adultos * precios.adulto + ninos * precios.nino;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setEnviando(true);
    try {
      const r = await fetch("/api/online/crear", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, fecha_visita: f.fecha, adultos, ninos, menores, acepta_datos: acepta }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Error"); setEnviando(false); return; }
      location.href = d.url;   // pasarela de pago Wompi
    } catch {
      setError("Sin conexión. Intenta de nuevo."); setEnviando(false);
    }
  };

  return (
    <main className="publica" style={{ maxWidth: 560, textAlign: "left" }}>
      <div style={{ textAlign: "center" }}><img src="/logo.png" alt="El Gran Pesebre de Tenjo 2026" style={{ width: 210 }} /></div>
      <h1 style={{ textAlign: "center" }}>Compra tus boletas</h1>
      {!activo ? (
        <div className="aviso" style={{ textAlign: "center" }}>
          La venta en línea abrirá muy pronto. Mientras tanto puedes comprar en la taquilla del evento.
        </div>
      ) : (
        <form className="tarjeta" onSubmit={pagar}>
          <label>Fecha de visita</label>
          <select value={f.fecha} onChange={set("fecha")}>
            {fechas.map((x) => <option key={x} value={x}>{fechaLarga(x)}</option>)}
          </select>
          <div className="contadores">
            <Fila t="Adultos" s={pesos(precios.adulto)} v={adultos} set={setAdultos} />
            <Fila t="Niños de 6 a 14 años" s={pesos(precios.nino)} v={ninos} set={setNinos} />
            <Fila t="Menores de 6 años" s="Gratis (igual reciben boleta)" v={menores} set={setMenores} />
          </div>
          <div className="fila">
            <div><label>Cédula</label><input inputMode="numeric" value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value.replace(/\D/g, "") })} /></div>
            <div><label>Celular (WhatsApp)</label><input inputMode="tel" value={f.celular} placeholder="3001234567" onChange={(e) => setF({ ...f, celular: e.target.value.replace(/\D/g, "").slice(0, 12) })} /></div>
          </div>
          <label>Nombre completo</label>
          <input value={f.nombre} onChange={set("nombre")} />
          <label>Correo electrónico</label>
          <input type="email" value={f.email} onChange={set("email")} />
          <input name="sitio_web" value={f.sitio_web} onChange={set("sitio_web")} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontWeight: 400 }}>
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
            <span>Autorizo el tratamiento de mis datos personales según la <a href="/privacidad" target="_blank">política de privacidad</a>.</span>
          </label>

          <div className="total"><span>Total a pagar</span><b>{pesos(total)}</b></div>
          {error && <div className="error">{error}</div>}
          <button className="btn grande" style={{ marginTop: 12 }} disabled={enviando || !acepta || total === 0}>
            {enviando ? "Conectando con la pasarela…" : "Pagar con Wompi"}
          </button>
          <p className="suave" style={{ fontSize: ".85rem" }}>
            Pagas con tarjeta, PSE, Nequi o Bancolombia. Al aprobarse el pago verás tus boletas con código QR y podrás
            enviártelas por WhatsApp. Cada boleta sirve una sola vez y sólo para la fecha elegida.
          </p>
        </form>
      )}
    </main>
  );
}
