"use client";
import { useEffect, useRef, useState } from "react";
import { BoletaPantalla, ZonaImpresion } from "@/components/Boletas";
import { Compra, linkWhatsApp } from "@/components/tipos";
import { fechaLarga, pesos } from "@/lib/config";

type Precios = { adulto: number; nino: number; menor: number };
const METODOS: [string, string][] = [
  ["efectivo", "💵 Efectivo"], ["datafono", "💳 Datáfono"], ["transferencia", "🏦 Transf."], ["qr", "📱 QR"],
];

function fechaCorta(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function Contador({ titulo, sub, valor, set }: { titulo: string; sub: string; valor: number; set: (n: number) => void }) {
  return (
    <div className="contador">
      <div className="tipo"><b>{titulo}</b><span>{sub}</span></div>
      <div className="ctrl">
        <button type="button" onClick={() => set(Math.max(0, valor - 1))}>−</button>
        <input inputMode="numeric" value={valor} onChange={(e) => set(Math.max(0, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
        <button type="button" onClick={() => set(Math.min(30, valor + 1))}>+</button>
      </div>
    </div>
  );
}

export default function Taquilla({ precios, fechas }: { precios: Precios; fechas: string[] }) {
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [fecha, setFecha] = useState(fechas[0] ?? "");
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [menores, setMenores] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [compra, setCompra] = useState<Compra | null>(null);
  const [autoImprimir, setAutoImprimir] = useState(true);
  const cedulaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setAutoImprimir(localStorage.getItem("autoImprimir") !== "0"); } catch {}
  }, []);
  const cambiarAuto = (v: boolean) => {
    setAutoImprimir(v);
    try { localStorage.setItem("autoImprimir", v ? "1" : "0"); } catch {}
  };

  const total = adultos * precios.adulto + ninos * precios.nino;
  const rec = Number(recibido.replace(/\D/g, "")) || 0;
  const cambio = rec - total;

  // Cliente frecuente: al salir de la cédula, autocompleta nombre y celular
  const buscarCliente = async () => {
    if (cedula.length < 5 || nombre) return;
    try {
      const r = await fetch(`/api/buscar?q=${cedula}`);
      if (!r.ok) return;
      const d = await r.json();
      const previa = d.compras?.find((c: Compra) => c.cedula === cedula);
      if (previa) { setNombre(previa.nombre); setCelular(previa.celular); }
    } catch {}
  };

  const vender = async (e?: React.FormEvent, sinAdultoOk = false) => {
    e?.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(""); setConfirmar(false);
    try {
      const r = await fetch("/api/ventas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula, nombre, celular, fecha_visita: fecha, adultos, ninos, menores,
          metodo_pago: metodo, sin_adulto_ok: sinAdultoOk,
        }),
      });
      const d = await r.json();
      if (r.status === 409 && d.confirmar) { setConfirmar(true); return; }
      if (!r.ok) { setError(d.error ?? "Error"); return; }
      setCompra(d.compra);
      setCedula(""); setNombre(""); setCelular(""); setAdultos(1); setNinos(0); setMenores(0); setRecibido("");
      if (autoImprimir) setTimeout(() => window.print(), 250);
      cedulaRef.current?.focus();
    } catch {
      setError("Sin conexión. Revisa el internet y vuelve a intentar (la venta NO se guardó).");
    } finally {
      setEnviando(false);
    }
  };

  const origen = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <main className="contenedor pantalla">
        <div className="grid-2">
          <form className="tarjeta" onSubmit={vender}>
            <h1>Nueva venta</h1>
            <div className="fila">
              <div>
                <label>Cédula del comprador</label>
                <input ref={cedulaRef} inputMode="numeric" value={cedula} autoFocus
                  onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))} onBlur={buscarCliente} />
              </div>
              <div>
                <label>Celular (WhatsApp)</label>
                <input inputMode="tel" value={celular} placeholder="3001234567"
                  onChange={(e) => setCelular(e.target.value.replace(/\D/g, "").slice(0, 12))} />
              </div>
            </div>
            <label>Nombre completo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />

            <label>Fecha de visita</label>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {fechas.map((f) => <option key={f} value={f}>{fechaCorta(f)} — {fechaLarga(f)}</option>)}
            </select>

            <div className="contadores">
              <Contador titulo="Adultos" sub={pesos(precios.adulto)} valor={adultos} set={setAdultos} />
              <Contador titulo="Niños de 6 a 14 años" sub={pesos(precios.nino)} valor={ninos} set={setNinos} />
              <Contador titulo="Menores de 6 años" sub="Gratis (igual reciben boleta)" valor={menores} set={setMenores} />
            </div>

            <label>Método de pago</label>
            <div className="metodos">
              {METODOS.map(([v, t]) => (
                <button type="button" key={v} className={metodo === v ? "activo" : ""} onClick={() => setMetodo(v)}>{t}</button>
              ))}
            </div>

            <div className="total"><span>Total a pagar</span><b>{pesos(total)}</b></div>

            {metodo === "efectivo" && total > 0 && (
              <div className="fila" style={{ alignItems: "end" }}>
                <div>
                  <label style={{ marginTop: 0 }}>Recibido</label>
                  <input inputMode="numeric" value={recibido ? pesos(rec) : ""} placeholder="$0"
                    onChange={(e) => setRecibido(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="cambio">
                  {rec > 0 && (cambio >= 0
                    ? <>Cambio: <b style={{ color: "var(--oro-claro)", fontSize: "1.4rem" }}>{pesos(cambio)}</b></>
                    : <span style={{ color: "#ff9b9b" }}>Faltan {pesos(-cambio)}</span>)}
                </div>
              </div>
            )}

            {error && <div className="error">{error}</div>}
            {confirmar && (
              <div className="aviso">
                Esta compra no tiene ningún adulto. ¿Continuar de todas formas?
                <div className="acciones">
                  <button type="button" className="btn chico" onClick={() => vender(undefined, true)}>Sí, vender</button>
                  <button type="button" className="btn sec chico" onClick={() => setConfirmar(false)}>Corregir</button>
                </div>
              </div>
            )}

            <button className="btn grande" style={{ marginTop: 16 }} disabled={enviando}>
              {enviando ? "Guardando…" : `Vender ${adultos + ninos + menores} boleta(s)`}
            </button>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={autoImprimir} onChange={(e) => cambiarAuto(e.target.checked)} />
              Imprimir automáticamente al vender
            </label>
          </form>

          <section className="tarjeta">
            {!compra ? (
              <div className="suave" style={{ textAlign: "center", padding: "40px 10px" }}>
                <img src="/logo.png" alt="" style={{ width: 180, opacity: .5 }} />
                <p>Aquí aparecerá la última venta para imprimir o enviar por WhatsApp.</p>
              </div>
            ) : (
              <>
                <h2>✅ Venta #{compra.id} · {pesos(compra.total)}</h2>
                <p className="suave" style={{ marginTop: -6 }}>
                  {compra.nombre} · {compra.celular} · {fechaLarga(compra.fecha_visita)}
                </p>
                <div className="acciones" style={{ marginBottom: 14 }}>
                  <button className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
                  <a className="btn wa" target="_blank" rel="noreferrer" href={linkWhatsApp(compra, origen, fechaLarga)}>
                    WhatsApp
                  </a>
                  <a className="btn sec" target="_blank" rel="noreferrer" href={`/c/${compra.token}`}>Ver enlace</a>
                </div>
                <div className="boletas-lista" style={{ maxHeight: "62vh", overflow: "auto", paddingRight: 4 }}>
                  {compra.boletas.map((b, i) => <BoletaPantalla key={b.id} b={b} c={compra} i={i} />)}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <ZonaImpresion compra={compra} />
    </>
  );
}
