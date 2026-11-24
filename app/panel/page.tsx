"use client";
import { useCallback, useEffect, useState } from "react";
import { ZonaImpresion } from "@/components/Boletas";
import { Compra, linkWhatsApp } from "@/components/tipos";
import { NOMBRE_METODO, hora } from "@/components/Campos";
import { fechaLarga, pesos } from "@/lib/config";

type Caja = { taquilla: string; metodo_pago: string; compras: number; adultos: number; ninos: number; menores: number; total: number };
type CajaArqueo = { id: number; taquilla: string; base: number; abierta_at: string; cerrada_at: string | null; efectivo_sistema: number | null; contado: number | null; diferencia: number | null; notas: string | null };
type Resumen = {
  caja: Caja[];
  canales: { canal: string; compras: number; boletas: number; total: number }[];
  cortesias: { autorizado_por: string; motivo: string; compras: number; boletas: number }[];
  cortesias_tope: { tope: number; usadas: number };
  cajas: CajaArqueo[];
  online_pendientes: number;
  aforo: { total: number; ingresadas: number; pendientes: number; adultos: number; ninos: number; menores: number };
  por_puerta: { puerta: string; ingresos: number }[];
  escaneos: { created_at: string; resultado: string; puerta: string; codigo: string }[];
  acumulado: { compras: number; boletas: number; total: number };
};

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const CANAL: Record<string, string> = { taquilla: "🎟️ Taquilla", online: "🌐 En línea", cortesia: "🎁 Cortesías" };
const RESULTADO: Record<string, [string, string]> = {
  ok: ["INGRESÓ", "#5ee28f"], usada: ["YA USADA", "#ff9b9b"], otra_fecha: ["OTRA FECHA", "#ffc46b"], anulada: ["ANULADA", "#ff9b9b"],
  firma_invalida: ["FALSA", "#ff9b9b"], no_existe: ["NO EXISTE", "#ff9b9b"], pendiente_pago: ["SIN PAGAR", "#ffc46b"], compra_anulada: ["COMPRA ANULADA", "#a9b0cc"],
};

export default function Panel() {
  const [fecha, setFecha] = useState(hoy());
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [imprimir, setImprimir] = useState<Compra | null>(null);
  const [anulando, setAnulando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch(`/api/panel?fecha=${fecha}`, { cache: "no-store" });
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
    const resp = await fetch("/api/anular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, motivo }) });
    const d = await resp.json();
    if (!resp.ok) return setError(d.error);
    if (d.boletas_ya_usadas > 0) setError(`Compra anulada. Ojo: ${d.boletas_ya_usadas} boleta(s) de esa compra ya habían ingresado.`);
    setAnulando(null); setMotivo("");
    await buscar(); await cargar();
  };

  const caja = r?.caja ?? [];
  const totalDia = (r?.canales ?? []).reduce((s, x) => s + x.total, 0);
  const porTaquilla = Object.entries(caja.reduce<Record<string, Caja[]>>((acc, x) => {
    (acc[x.taquilla] ??= []).push(x); return acc;
  }, {}));
  const pct = r && r.aforo.total ? Math.round((r.aforo.ingresadas / r.aforo.total) * 100) : 0;
  const origen = typeof window !== "undefined" ? location.origin : "";
  const cort = r?.cortesias_tope;

  return (
    <>
      <main className="contenedor pantalla">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>Panel · {fechaLarga(fecha)}</h1>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: "auto" }} />
        </div>
        {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
        {(r?.online_pendientes ?? 0) > 0 && <div className="aviso" style={{ marginBottom: 14 }}>🌐 {r!.online_pendientes} compra(s) en línea esperando confirmación de pago.</div>}

        <div className="kpis">
          <div className="tarjeta kpi"><div className="etiqueta">Vendido este día</div><div className="valor">{pesos(totalDia)}</div>
            <div className="suave">{(r?.canales ?? []).filter((c) => c.canal !== "cortesia").map((c) => `${CANAL[c.canal] ?? c.canal}: ${pesos(c.total)}`).join(" · ") || "Sin ventas"}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Visitantes con boleta para este día</div><div className="valor">{r?.aforo.total ?? "—"}</div>
            <div className="suave">{r?.aforo.adultos ?? 0} adultos · {r?.aforo.ninos ?? 0} niños · {r?.aforo.menores ?? 0} menores</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Ya ingresaron</div><div className="valor">{r?.aforo.ingresadas ?? "—"}</div>
            <div className="barra-progreso"><div style={{ width: pct + "%" }} /></div><div className="suave">{pct}% · faltan {r?.aforo.pendientes ?? 0}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Cortesías del evento</div><div className="valor">{cort?.usadas ?? "—"}<span style={{ fontSize: "1rem" }}> / {cort?.tope ?? "—"}</span></div>
            <div className="suave"><a href="/cortesias">Gestionar cortesías →</a></div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Acumulado del evento</div><div className="valor">{pesos(r?.acumulado.total ?? 0)}</div><div className="suave">{r?.acumulado.boletas ?? 0} boletas · {r?.acumulado.compras ?? 0} compras</div></div>
        </div>

        <div className="grid-2">
          <section className="tarjeta">
            <h2>📈 Por canal (este día)</h2>
            <table>
              <thead><tr><th>Canal</th><th className="num">Compras</th><th className="num">Boletas</th><th className="num">Total</th></tr></thead>
              <tbody>
                {(r?.canales ?? []).map((c) => <tr key={c.canal}><td>{CANAL[c.canal] ?? c.canal}</td><td className="num">{c.compras}</td><td className="num">{c.boletas}</td><td className="num">{pesos(c.total)}</td></tr>)}
              </tbody>
            </table>

            <h2 style={{ marginTop: 22 }}>💰 Taquillas (ventas hechas este día)</h2>
            {porTaquilla.length === 0 && <p className="suave">Sin ventas en taquilla.</p>}
            {porTaquilla.map(([taq, filas]) => (
              <div key={taq} style={{ marginBottom: 18 }}>
                <h3>{taq}</h3>
                <table>
                  <thead><tr><th>Método</th><th className="num">Compras</th><th className="num">Boletas</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.metodo_pago}><td>{NOMBRE_METODO[f.metodo_pago] ?? f.metodo_pago}</td><td className="num">{f.compras}</td>
                        <td className="num">{f.adultos + f.ninos + f.menores}</td><td className="num">{pesos(f.total)}</td></tr>
                    ))}
                    <tr><td><b>Total</b></td><td /><td className="num"><b>{filas.reduce((s, f) => s + f.adultos + f.ninos + f.menores, 0)}</b></td>
                      <td className="num"><b>{pesos(filas.reduce((s, f) => s + f.total, 0))}</b></td></tr>
                  </tbody>
                </table>
              </div>
            ))}

            <h2 style={{ marginTop: 10 }}>🧮 Arqueos de caja</h2>
            {(r?.cajas ?? []).length === 0 && <p className="suave">No hay cajas abiertas ni cerradas este día.</p>}
            <table><tbody>
              {(r?.cajas ?? []).map((k) => (
                <tr key={k.id}>
                  <td><b>{k.taquilla}</b><br /><span className="suave" style={{ fontSize: ".8rem" }}>{hora(k.abierta_at)} → {k.cerrada_at ? hora(k.cerrada_at) : "abierta"}</span></td>
                  <td className="num">Base {pesos(k.base)}{k.cerrada_at && <><br />Contado {pesos(k.contado ?? 0)}</>}</td>
                  <td className="num">{k.cerrada_at
                    ? <b style={{ color: (k.diferencia ?? 0) === 0 ? "#5ee28f" : "#ff9b9b" }}>{(k.diferencia ?? 0) > 0 ? "+" : ""}{pesos(k.diferencia ?? 0)}</b>
                    : <span className="suave">en curso</span>}{k.notas && <><br /><span className="suave" style={{ fontSize: ".8rem" }}>{k.notas}</span></>}</td>
                </tr>
              ))}
            </tbody></table>

            <h2 style={{ marginTop: 22 }}>🎁 Cortesías entregadas este día</h2>
            {(r?.cortesias ?? []).length === 0 && <p className="suave">Ninguna.</p>}
            <table><tbody>
              {(r?.cortesias ?? []).map((c, i) => <tr key={i}><td>{c.motivo}<br /><span className="suave" style={{ fontSize: ".8rem" }}>Autorizó: {c.autorizado_por}</span></td><td className="num">{c.boletas} boletas</td></tr>)}
            </tbody></table>

            <h2 style={{ marginTop: 22 }}>🚪 Ingresos por puerta</h2>
            <table><tbody>
              {(r?.por_puerta ?? []).map((p) => <tr key={p.puerta}><td>{p.puerta}</td><td className="num">{p.ingresos}</td></tr>)}
            </tbody></table>
          </section>

          <section className="tarjeta">
            <h2>📥 Exportar a Excel</h2>
            <div className="fila" style={{ alignItems: "end" }}>
              <div><label style={{ marginTop: 0 }}>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
              <div><label style={{ marginTop: 0 }}>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            </div>
            <a className="btn sec" style={{ marginTop: 10 }} href={`/api/exportar?desde=${desde}&hasta=${hasta}`}>Descargar ventas, cortesías y facturas (CSV)</a>

            <h2 style={{ marginTop: 22 }}>🔎 Buscar compra</h2>
            <form onSubmit={buscar} style={{ display: "flex", gap: 8 }}>
              <input inputMode="numeric" placeholder="Cédula o celular" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn">Buscar</button>
            </form>
            {compras?.length === 0 && <p className="suave">No se encontraron compras.</p>}
            {compras?.map((c) => (
              <div key={c.id} className={"compra-item" + (c.anulada ? " anulada" : "")}>
                <b>#{c.id} · {c.nombre}</b> <span className="suave">{CANAL[c.canal ?? "taquilla"]}</span>
                {c.anulada && <span style={{ color: "#ff9b9b" }}> (ANULADA{c.anulada_motivo ? `: ${c.anulada_motivo}` : ""}{c.anulada_por ? ` · ${c.anulada_por}` : ""})</span>}
                {c.estado_pago && c.estado_pago !== "pagado" && <span style={{ color: "#ffc46b" }}> · pago {c.estado_pago}</span>}
                <div className="suave" style={{ fontSize: ".9rem" }}>
                  {fechaLarga(c.fecha_visita)} · {c.boletas.length} boletas · {pesos(c.total)} · {NOMBRE_METODO[c.metodo_pago] ?? c.metodo_pago}{c.referencia_pago ? ` (${c.referencia_pago})` : ""} · {c.taquilla}
                  {c.motivo && <><br />Cortesía: {c.motivo} · autorizó {c.autorizado_por}</>}
                  <br />Usadas: {c.boletas.filter((b) => b.estado === "usada").length} de {c.boletas.length}
                </div>
                {!c.anulada && (
                  <div className="acciones">
                    <button className="btn chico" onClick={() => reimprimir(c)}>🖨️ Reimprimir</button>
                    <a className="btn wa chico" target="_blank" rel="noreferrer" href={linkWhatsApp(c, origen, fechaLarga)}>WhatsApp</a>
                    <a className="btn sec chico" target="_blank" rel="noreferrer" href={`/c/${c.token}`}>Ver</a>
                    {anulando === c.id ? (
                      <div style={{ display: "flex", gap: 6, width: "100%", marginTop: 6 }}>
                        <input placeholder="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ padding: 8 }} />
                        <button className="btn peligro chico" disabled={motivo.trim().length < 4} onClick={() => anular(c.id)}>Anular</button>
                        <button className="btn sec chico" onClick={() => { setAnulando(null); setMotivo(""); }}>No</button>
                      </div>
                    ) : (
                      <button className="btn peligro chico" onClick={() => setAnulando(c.id)}>Anular</button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <h2 style={{ marginTop: 22 }}>📋 Últimos escaneos</h2>
            <table><tbody>
              {(r?.escaneos ?? []).map((e, i) => {
                const [t, color] = RESULTADO[e.resultado] ?? [e.resultado, "#a9b0cc"];
                return (
                  <tr key={i}>
                    <td>{new Date(e.created_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}</td>
                    <td>{e.puerta}</td>
                    <td style={{ color, fontWeight: 700 }}>{t}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </section>
        </div>
      </main>
      <ZonaImpresion compra={imprimir} />
    </>
  );
}
