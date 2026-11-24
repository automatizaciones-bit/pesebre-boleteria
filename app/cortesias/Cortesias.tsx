"use client";
import { useCallback, useEffect, useState } from "react";
import { ZonaImpresion } from "@/components/Boletas";
import { Compra, linkWhatsApp } from "@/components/tipos";
import { Contador, CasillaDatos, fechaCorta } from "@/components/Campos";
import { fechaLarga } from "@/lib/config";

type Resultado = { fila: number; nombre: string; compra?: Compra; error?: string };
type Linea = { nombre: string; cedula: string; celular: string; adultos: number; ninos: number; menores: number };

/** "Nombre; cédula; celular; adultos; niños; menores" (también acepta tabulaciones al pegar desde Excel) */
function leerLote(texto: string): Linea[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/[;\t]/).map((x) => x.trim());
    const n = (v?: string, def = 0) => (v === undefined || v === "" ? def : Math.max(0, Math.floor(Number(v) || 0)));
    return { nombre: p[0] ?? "", cedula: (p[1] ?? "").replace(/\D/g, ""), celular: (p[2] ?? "").replace(/\D/g, ""), adultos: n(p[3], 1), ninos: n(p[4]), menores: n(p[5]) };
  });
}

export default function Cortesias({ fechas }: { fechas: string[] }) {
  const [modo, setModo] = useState<"una" | "lote">("una");
  const [fecha, setFecha] = useState(fechas[0] ?? "");
  const [motivo, setMotivo] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [uno, setUno] = useState({ nombre: "", cedula: "", celular: "" });
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [menores, setMenores] = useState(0);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [imprimir, setImprimir] = useState<Compra[]>([]);
  const [tope, setTope] = useState<{ tope: number; usadas: number } | null>(null);
  const [nuevoTope, setNuevoTope] = useState("");

  const cargarTope = useCallback(async () => {
    try {
      const r = await fetch("/api/panel", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setTope(d.cortesias_tope);
    } catch {}
  }, []);
  useEffect(() => { cargarTope(); }, [cargarTope]);

  const lote = leerLote(texto);
  const boletasLote = lote.reduce((s, l) => s + l.adultos + l.ninos + l.menores, 0);
  const disponibles = tope ? Math.max(tope.tope - tope.usadas, 0) : null;

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(""); setResultados(null);
    const cuerpo = modo === "una"
      ? { ...uno, adultos, ninos, menores, fecha_visita: fecha, motivo, acepta_datos: acepta }
      : { lote, fecha_visita: fecha, motivo, acepta_datos: acepta };
    try {
      const r = await fetch("/api/cortesias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Error"); return; }
      setResultados(d.resultados);
      if (d.creadas > 0) {
        if (modo === "una") { setUno({ nombre: "", cedula: "", celular: "" }); setAdultos(1); setNinos(0); setMenores(0); }
        else setTexto("");
      }
      cargarTope();
    } catch {
      setError("Sin conexión. Revisa el internet.");
    } finally {
      setEnviando(false);
    }
  };

  const guardarTope = async () => {
    const r = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tope_cortesias: Number(nuevoTope) }) });
    const d = await r.json();
    if (!r.ok) return setError(d.error);
    setNuevoTope(""); cargarTope();
  };

  const imprimirLista = (lista: Compra[]) => { setImprimir(lista); setTimeout(() => window.print(), 250); };
  const creadas = (resultados ?? []).filter((r) => r.compra).map((r) => r.compra!) ;
  const origen = typeof window !== "undefined" ? location.origin : "";

  return (
    <>
      <main className="contenedor pantalla">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ margin: 0 }}>🎁 Cortesías</h1>
          {tope && (
            <div className="tarjeta" style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>Usadas <b style={{ color: "var(--oro-claro)" }}>{tope.usadas}</b> de <b>{tope.tope}</b> · disponibles <b>{disponibles}</b></span>
              <input style={{ width: 110, padding: 8 }} inputMode="numeric" placeholder="Nuevo tope" value={nuevoTope} onChange={(e) => setNuevoTope(e.target.value.replace(/\D/g, ""))} />
              <button className="btn sec chico" disabled={!nuevoTope} onClick={guardarTope}>Cambiar tope</button>
            </div>
          )}
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <form className="tarjeta" onSubmit={crear}>
            <div className="metodos" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 6 }}>
              <button type="button" className={modo === "una" ? "activo" : ""} onClick={() => setModo("una")}>Una cortesía</button>
              <button type="button" className={modo === "lote" ? "activo" : ""} onClick={() => setModo("lote")}>Varias (lote)</button>
            </div>

            <label>Motivo / entidad (patrocinador, prensa, alcaldía…)</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Patrocinador Almacenes X" />
            <label>Fecha de visita</label>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {fechas.map((f) => <option key={f} value={f}>{fechaCorta(f)} — {fechaLarga(f)}</option>)}
            </select>

            {modo === "una" ? (
              <>
                <div className="fila">
                  <div><label>Cédula del titular</label><input inputMode="numeric" value={uno.cedula} onChange={(e) => setUno({ ...uno, cedula: e.target.value.replace(/\D/g, "") })} /></div>
                  <div><label>Celular (WhatsApp)</label><input inputMode="tel" value={uno.celular} onChange={(e) => setUno({ ...uno, celular: e.target.value.replace(/\D/g, "").slice(0, 12) })} /></div>
                </div>
                <label>Nombre completo del titular</label>
                <input value={uno.nombre} onChange={(e) => setUno({ ...uno, nombre: e.target.value })} />
                <div className="contadores">
                  <Contador titulo="Adultos" sub="Cortesía" valor={adultos} set={setAdultos} />
                  <Contador titulo="Niños de 6 a 14 años" sub="Cortesía" valor={ninos} set={setNinos} />
                  <Contador titulo="Menores de 6 años" sub="Cortesía" valor={menores} set={setMenores} />
                </div>
              </>
            ) : (
              <>
                <label>Pega la lista (una persona por línea)</label>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
                  placeholder={"Nombre; cédula; celular; adultos; niños; menores\nAna Pérez; 1012345678; 3001234567; 2; 1; 0\nLuis Gómez; 79876543; 3109876543"}
                  style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #2c3870", background: "#0d1430", color: "var(--texto)", fontFamily: "ui-monospace, monospace", fontSize: ".9rem" }} />
                <p className="suave" style={{ fontSize: ".85rem" }}>
                  Puedes copiar columnas desde Excel. Si no pones cantidades, se asume 1 adulto.
                  {lote.length > 0 && <> · <b>{lote.length}</b> personas · <b>{boletasLote}</b> boletas</>}
                  {disponibles !== null && boletasLote > disponibles && <b style={{ color: "#ff9b9b" }}> · supera las {disponibles} disponibles</b>}
                </p>
              </>
            )}

            <CasillaDatos valor={acepta} set={setAcepta} texto={modo === "una" ? "El titular autoriza el tratamiento de sus datos personales" : "Los titulares autorizaron el tratamiento de sus datos personales"} />
            {error && <div className="error">{error}</div>}
            <button className="btn grande" style={{ marginTop: 14 }} disabled={enviando || !acepta || (modo === "lote" && lote.length === 0)}>
              {enviando ? "Creando…" : modo === "una" ? `Crear cortesía (${adultos + ninos + menores} boleta/s)` : `Crear ${lote.length} cortesías`}
            </button>
          </form>

          <section className="tarjeta">
            {!resultados ? (
              <p className="suave" style={{ textAlign: "center", padding: "40px 10px" }}>
                Las cortesías creadas aparecerán aquí para imprimir o enviar por WhatsApp.<br />
                En la portería se identifican como <b>CORTESÍA</b> y en el panel se reportan aparte de las ventas.
              </p>
            ) : (
              <>
                <h2>{creadas.length} cortesía(s) creadas{resultados.length > creadas.length && <span style={{ color: "#ff9b9b" }}> · {resultados.length - creadas.length} con error</span>}</h2>
                {creadas.length > 1 && <button className="btn" onClick={() => imprimirLista(creadas)}>🖨️ Imprimir todas</button>}
                <table style={{ marginTop: 10 }}>
                  <tbody>
                    {resultados.map((r) => (
                      <tr key={r.fila}>
                        <td>{r.fila}. {r.nombre}</td>
                        <td>{r.compra ? (
                          <div className="acciones" style={{ marginTop: 0 }}>
                            <button className="btn chico" onClick={() => imprimirLista([r.compra!])}>🖨️</button>
                            <a className="btn wa chico" target="_blank" rel="noreferrer" href={linkWhatsApp(r.compra, origen, fechaLarga)}>WhatsApp</a>
                            <a className="btn sec chico" target="_blank" rel="noreferrer" href={`/c/${r.compra.token}`}>Ver</a>
                          </div>
                        ) : <span style={{ color: "#ff9b9b" }}>{r.error}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>
      </main>
      <ZonaImpresion compras={imprimir} />
    </>
  );
}
