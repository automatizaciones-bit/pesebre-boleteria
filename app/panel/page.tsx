"use client";
import { useCallback, useEffect, useState } from "react";
import { ZonaImpresion } from "@/components/Boletas";
import { Compra, linkWhatsApp } from "@/components/tipos";
import { fechaLarga, pesos } from "@/lib/config";

type Caja = { taquilla: string; metodo_pago: string; compras: number; adultos: number; ninos: number; menores: number; total: number };
type Resumen = {
  caja: Caja[];
  aforo: { total: number; ingresadas: number; pendientes: number; adultos: number; ninos: number; menores: number };
  por_puerta: { puerta: string; ingresos: number }[];
  escaneos: { created_at: string; resultado: string; puerta: string; codigo: string }[];
  acumulado: { compras: number; boletas: number; total: number };
};

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const METODO: Record<string, string> = { efectivo: "Efectivo", datafono: "Datáfono", transferencia: "Transferencia", qr: "QR" };

export default function Panel() {
  const [fecha, setFecha] = useState(hoy());
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [imprimir, setImprimir] = useState<Compra | null>(null);
  const [anulando, setAnulando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch(`/api/panel?fecha=${fecha}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setR(d); setError("");
    } catch (e) { setError(String((e as Error).message ?? e)); }
  }, [fecha]);

  useEffect(() => { cargar(); const i = setInterval(cargar, 15000); return () => clearInterval(i); }, [cargar]);

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const resp = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
    const d = await resp.json();
    if (!resp.ok) return setError(d.error);
    setCompras(d.compras);
  };

  const reimprimir = (c: Compra) => { setImprimir(c); setTimeout(() => window.print(), 250); };

  const anular = async (id: number) => {
    const resp = await fetch("/api/anular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setAnulando(null);
    if (!resp.ok) return setError((await resp.json()).error);
    await buscar(); await cargar();
  };

  const caja = r?.caja ?? [];
  const totalDia = caja.reduce((s, x) => s + x.total, 0);
  const boletasDia = caja.reduce((s, x) => s + x.adultos + x.ninos + x.menores, 0);
  const porTaquilla = Object.entries(caja.reduce<Record<string, Caja[]>>((acc, x) => {
    (acc[x.taquilla] ??= []).push(x); return acc;
  }, {}));
  const pct = r && r.aforo.total ? Math.round((r.aforo.ingresadas / r.aforo.total) * 100) : 0;
  const origen = typeof window !== "undefined" ? location.origin : "";

  return (
    <>
      <main className="contenedor pantalla">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>Panel · {fechaLarga(fecha)}</h1>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: "auto" }} />
        </div>
        {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="kpis">
          <div className="tarjeta kpi"><div className="etiqueta">Vendido este día</div><div className="valor">{pesos(totalDia)}</div><div className="suave">{boletasDia} boletas</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Visitantes con boleta para este día</div><div className="valor">{r?.aforo.total ?? "—"}</div>
            <div className="suave">{r?.aforo.adultos ?? 0} adultos · {r?.aforo.ninos ?? 0} niños · {r?.aforo.menores ?? 0} menores</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Ya ingresaron</div><div className="valor">{r?.aforo.ingresadas ?? "—"}</div>
            <div className="barra-progreso"><div style={{ width: pct + "%" }} /></div><div className="suave">{pct}% · faltan {r?.aforo.pendientes ?? 0}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Acumulado del evento</div><div className="valor">{pesos(r?.acumulado.total ?? 0)}</div><div className="suave">{r?.acumulado.boletas ?? 0} boletas · {r?.acumulado.compras ?? 0} compras</div></div>
        </div>

        <div className="grid-2">
          <section className="tarjeta">
            <h2>💰 Cierre de caja (ventas hechas este día)</h2>
            {porTaquilla.length === 0 && <p className="suave">Sin ventas.</p>}
            {porTaquilla.map(([taq, filas]) => (
              <div key={taq} style={{ marginBottom: 18 }}>
                <h3>{taq}</h3>
                <table>
                  <thead><tr><th>Método</th><th className="num">Compras</th><th className="num">Boletas</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.metodo_pago}><td>{METODO[f.metodo_pago] ?? f.metodo_pago}</td><td className="num">{f.compras}</td>
                        <td className="num">{f.adultos + f.ninos + f.menores}</td><td className="num">{pesos(f.total)}</td></tr>
                    ))}
                    <tr><td><b>Total</b></td><td /><td className="num"><b>{filas.reduce((s, f) => s + f.adultos + f.ninos + f.menores, 0)}</b></td>
                      <td className="num"><b>{pesos(filas.reduce((s, f) => s + f.total, 0))}</b></td></tr>
                  </tbody>
                </table>
              </div>
            ))}
            <h2 style={{ marginTop: 10 }}>🚪 Ingresos por puerta</h2>
            <table><tbody>
              {(r?.por_puerta ?? []).map((p) => <tr key={p.puerta}><td>{p.puerta}</td><td className="num">{p.ingresos}</td></tr>)}
            </tbody></table>
          </section>

          <section className="tarjeta">
            <h2>🔎 Buscar compra</h2>
            <form onSubmit={buscar} style={{ display: "flex", gap: 8 }}>
              <input inputMode="numeric" placeholder="Cédula o celular" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn">Buscar</button>
            </form>
            {compras?.length === 0 && <p className="suave">No se encontraron compras.</p>}
            {compras?.map((c) => (
              <div key={c.id} className={"compra-item" + (c.anulada ? " anulada" : "")}>
                <b>#{c.id} · {c.nombre}</b> {c.anulada && <span style={{ color: "#ff9b9b" }}>(ANULADA)</span>}
                <div className="suave" style={{ fontSize: ".9rem" }}>
                  {fechaLarga(c.fecha_visita)} · {c.boletas.length} boletas · {pesos(c.total)} · {METODO[c.metodo_pago]} · {c.taquilla}
                  <br />Usadas: {c.boletas.filter((b) => b.estado === "usada").length} de {c.boletas.length}
                </div>
                {!c.anulada && (
                  <div className="acciones">
                    <button className="btn chico" onClick={() => reimprimir(c)}>🖨️ Reimprimir</button>
                    <a className="btn wa chico" target="_blank" rel="noreferrer" href={linkWhatsApp(c, origen, fechaLarga)}>WhatsApp</a>
                    <a className="btn sec chico" target="_blank" rel="noreferrer" href={`/c/${c.token}`}>Ver</a>
                    {anulando === c.id ? (
                      <>
                        <button className="btn peligro chico" onClick={() => anular(c.id)}>Sí, anular</button>
                        <button className="btn sec chico" onClick={() => setAnulando(null)}>No</button>
                      </>
                    ) : (
                      <button className="btn peligro chico" onClick={() => setAnulando(c.id)}>Anular</button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <h2 style={{ marginTop: 22 }}>📋 Últimos escaneos</h2>
            <table><tbody>
              {(r?.escaneos ?? []).map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.created_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}</td>
                  <td>{e.puerta}</td>
                  <td style={{ color: e.resultado === "ok" ? "#5ee28f" : "#ff9b9b", fontWeight: 700 }}>{e.resultado === "ok" ? "INGRESÓ" : e.resultado.replace("_", " ").toUpperCase()}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        </div>
      </main>
      <ZonaImpresion compra={imprimir} />
    </>
  );
}
