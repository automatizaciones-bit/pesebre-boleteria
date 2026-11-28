"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GrupoPantalla, ZonaImpresion } from "@/components/Boletas";
import { Compra, linkWhatsApp } from "@/components/tipos";
import {
  Contador, CasillaDatos, CamposFactura, FACTURA_VACIA, Factura, fechaCorta,
  EstadoCaja, ReporteCaja, NOMBRE_METODO, hora, comprimirFoto,
} from "@/components/Campos";
import { fechaLarga, pesos } from "@/lib/config";

type Precios = { adulto: number; nino: number; menor: number };
const METODOS: [string, string][] = [
  ["efectivo", "💵 Efectivo"], ["datafono", "💳 Datáfono"], ["nequi", "🟣 Nequi"],
  ["bancolombia", "🟡 Bancolombia"], ["daviplata", "🔴 Daviplata"], ["transferencia", "🏦 Otro banco"],
];
const A_VERIFICAR = ["nequi", "bancolombia", "daviplata", "transferencia"];
type Cierre = { caja: Record<string, any>; resumen: EstadoCaja; envio?: { correo: string; whatsapp?: string }; whatsapp_admin?: string | null; pdf?: string };
type Envio = { correo: string; whatsapp: string };

/* ---------------- Caja: apertura, cierre con arqueo e historial ---------------- */
function PanelCaja({ caja, recargar, onCierre, imprimirCierre, puesto }: {
  caja: EstadoCaja | null; recargar: () => void; onCierre: (c: Cierre) => void; imprimirCierre: (c: Cierre) => void; puesto: string;
}) {
  const [base, setBase] = useState("");
  const [cajero, setCajero] = useState("");
  const [email, setEmail] = useState("");
  const [contado, setContado] = useState("");
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<Record<string, any>[] | null>(null);
  const num = (s: string) => Number(s.replace(/\D/g, "")) || 0;

  useEffect(() => {
    // Con usuario individual el cajero es el mismo usuario; con puesto genérico se recuerda el último nombre.
    const generico = /^(taquilla|puerta|administraci)/i.test(puesto);
    try { setCajero(generico ? localStorage.getItem("cajero") ?? "" : puesto); setEmail(localStorage.getItem("cajeroEmail") ?? ""); } catch { setCajero(generico ? "" : puesto); }
  }, [puesto]);

  const enviar = async (cuerpo: object) => {
    setError("");
    const r = await fetch("/api/caja", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json();
    if (!r.ok || d.ok === false) { setError(d.error ?? "Error"); return null; }
    return d;
  };
  const verHistorial = async () => {
    if (historial) return setHistorial(null);
    const r = await fetch("/api/caja?historial=1", { cache: "no-store" });
    const d = await r.json();
    if (r.ok) setHistorial(d.cierres ?? []); else setError(d.error);
  };

  if (!caja) return null;
  if (!caja.abierta) return (
    <div className="tarjeta" style={{ marginBottom: 16, borderColor: "var(--oro)" }}>
      <h2>💰 Abrir caja</h2>
      <p className="suave" style={{ marginTop: -4 }}>Antes de vender, cuenta el efectivo con el que empiezas (la base para dar cambio).</p>
      <div className="fila">
        <div><label>Nombre de quien maneja la caja</label><input value={cajero} onChange={(e) => setCajero(e.target.value)} placeholder="Ej: Kenide Gómez" /></div>
        <div><label>Correo para recibir el cierre (opcional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cajero@correo.com" /></div>
      </div>
      <div className="fila" style={{ alignItems: "end" }}>
        <div><label>Base inicial en efectivo</label>
          <input inputMode="numeric" value={base ? pesos(num(base)) : ""} placeholder="$0" onChange={(e) => setBase(e.target.value.replace(/\D/g, ""))} /></div>
        <button className="btn" onClick={async () => {
          if (await enviar({ accion: "abrir", base: num(base), cajero, email })) {
            try { localStorage.setItem("cajero", cajero); localStorage.setItem("cajeroEmail", email); } catch {}
            recargar();
          }
        }}>Abrir caja</button>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn sec chico" style={{ marginTop: 12 }} onClick={verHistorial}>{historial ? "Ocultar" : "🧾 Ver mis cierres anteriores"}</button>
      {historial && <Historial lista={historial} imprimir={imprimirCierre} />}
    </div>
  );

  const efectivo = caja.por_metodo?.efectivo?.total ?? 0;
  const otros = Object.entries(caja.por_metodo ?? {}).filter(([m]) => m !== "efectivo");
  return (
    <div className="tarjeta" style={{ marginBottom: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="suave" style={{ fontSize: ".9rem" }}>
          💰 <b style={{ color: "var(--texto)" }}>{caja.cajero}</b> · desde {hora(caja.abierta_at)} · Base {pesos(caja.base ?? 0)} ·
          Efectivo <b style={{ color: "var(--oro-claro)" }}>{pesos(efectivo)}</b>
          {otros.map(([m, v]) => <span key={m}> · {NOMBRE_METODO[m] ?? m} {pesos(v.total)} ({v.compras})</span>)}
          {" "}· {caja.boletas ?? 0} personas
          {(caja.por_verificar?.compras ?? 0) > 0 && <span style={{ color: "#ffc46b" }}> · {caja.por_verificar!.compras} pago(s) por verificar</span>}
        </div>
        {!cerrando && <button className="btn sec chico" onClick={() => setCerrando(true)}>Cerrar caja</button>}
      </div>
      {cerrando && (
        <div style={{ marginTop: 10 }}>
          <div className="fila">
            <div><label>Efectivo contado (base + ventas)</label>
              <input inputMode="numeric" value={contado ? pesos(num(contado)) : ""} placeholder="$0" onChange={(e) => setContado(e.target.value.replace(/\D/g, ""))} /></div>
            <div><label>Notas (opcional)</label><input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          </div>
          <p className="suave" style={{ fontSize: ".85rem" }}>Debe haber {pesos((caja.base ?? 0) + efectivo)} en efectivo. El informe se imprime y se envía al cajero y al administrador.</p>
          <div className="acciones">
            <button className="btn" disabled={!contado} onClick={async () => {
              const d = await enviar({ accion: "cerrar", contado: num(contado), notas });
              if (d) { onCierre(d); setCerrando(false); setContado(""); setNotas(""); recargar(); }
            }}>Cerrar, imprimir y enviar informe</button>
            <button className="btn sec" onClick={() => setCerrando(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function Historial({ lista, imprimir }: { lista: Record<string, any>[]; imprimir: (c: Cierre) => void }) {
  if (lista.length === 0) return <p className="suave">Todavía no hay cierres en este puesto.</p>;
  return (
    <table style={{ marginTop: 10 }}><tbody>
      {lista.map((k) => (
        <tr key={k.id}>
          <td>{hora(k.cerrada_at)}<br /><span className="suave" style={{ fontSize: ".8rem" }}>{k.cajero}</span></td>
          <td className="num">{pesos(k.resumen?.total ?? 0)}</td>
          <td className="num" style={{ color: k.diferencia === 0 ? "#5ee28f" : "#ff9b9b" }}>{k.diferencia > 0 ? "+" : ""}{pesos(k.diferencia)}</td>
          <td><button className="btn sec chico" onClick={() => imprimir({ caja: k, resumen: k.resumen })}>🖨️</button></td>
        </tr>
      ))}
    </tbody></table>
  );
}

/* ---------------- Pantalla de taquilla ---------------- */
export default function Taquilla({ precios, fechas, puesto }: { precios: Precios; fechas: string[]; puesto: string }) {
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [fecha, setFecha] = useState(fechas[0] ?? "");
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [menores, setMenores] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [recibido, setRecibido] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [factura, setFactura] = useState(false);
  const [datosFactura, setDatosFactura] = useState<Factura>(FACTURA_VACIA);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [compra, setCompra] = useState<Compra | null>(null);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [estadoFoto, setEstadoFoto] = useState("");
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [imprimir, setImprimir] = useState<"boletas" | "caja">("boletas");
  const [autoImprimir, setAutoImprimir] = useState(true);
  const [caja, setCaja] = useState<EstadoCaja | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const cedulaRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const cargarCaja = useCallback(async () => {
    try {
      const r = await fetch("/api/caja", { cache: "no-store" });
      if (r.ok) setCaja(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    try { setAutoImprimir(localStorage.getItem("autoImprimir") !== "0"); } catch {}
    setSinPermiso(new URLSearchParams(location.search).has("sin_permiso"));
    cargarCaja();
  }, [cargarCaja]);
  const cambiarAuto = (v: boolean) => {
    setAutoImprimir(v);
    try { localStorage.setItem("autoImprimir", v ? "1" : "0"); } catch {}
  };

  const total = adultos * precios.adulto + ninos * precios.nino;
  const rec = Number(recibido.replace(/\D/g, "")) || 0;
  const cambio = rec - total;
  const aVerificar = A_VERIFICAR.includes(metodo);

  // Cliente frecuente: al salir de la cédula, autocompleta nombre, celular y correo
  const buscarCliente = async () => {
    if (cedula.length < 5 || nombre) return;
    try {
      const r = await fetch(`/api/buscar?q=${cedula}`);
      if (!r.ok) return;
      const d = await r.json();
      const previa = d.compras?.find((c: Compra) => c.cedula === cedula);
      if (previa) { setNombre(previa.nombre); setCelular(previa.celular); if (previa.email) setEmail(previa.email); }
    } catch {}
  };

  const subirFoto = async (compraId: number, f: File) => {
    setEstadoFoto("Subiendo comprobante…");
    try {
      const fd = new FormData();
      fd.append("compra_id", String(compraId));
      fd.append("foto", await comprimirFoto(f), "comprobante.jpg");
      const r = await fetch("/api/comprobante", { method: "POST", body: fd });
      const d = await r.json();
      setEstadoFoto(r.ok ? "📎 Comprobante guardado" : "⚠ " + (d.error ?? "No se pudo subir el comprobante"));
    } catch {
      setEstadoFoto("⚠ No se pudo subir el comprobante (sin conexión)");
    }
  };

  const vender = async (e?: React.FormEvent, sinAdultoOk = false) => {
    e?.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(""); setConfirmar(false);
    try {
      const r = await fetch("/api/ventas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula, nombre, celular, email, fecha_visita: fecha, adultos, ninos, menores,
          metodo_pago: metodo, referencia_pago: referencia, acepta_datos: acepta,
          requiere_factura: factura, factura_datos: factura ? datosFactura : null,
          sin_adulto_ok: sinAdultoOk,
        }),
      });
      const d = await r.json();
      if (r.status === 409 && d.confirmar) { setConfirmar(true); return; }
      if (d.caja_cerrada) cargarCaja();
      if (!r.ok) { setError(d.error ?? "Error"); return; }
      setCompra(d.compra);
      setEnvio(d.envio ?? null);
      setEstadoFoto("");
      setImprimir("boletas");
      if (foto) subirFoto(d.compra.id, foto);
      setCedula(""); setNombre(""); setCelular(""); setEmail(""); setAdultos(1); setNinos(0); setMenores(0);
      setRecibido(""); setReferencia(""); setFoto(null); setAcepta(false); setFactura(false); setDatosFactura(FACTURA_VACIA);
      if (fotoRef.current) fotoRef.current.value = "";
      if (autoImprimir) setTimeout(() => window.print(), 250);
      cargarCaja();
      cedulaRef.current?.focus();
    } catch {
      setError("Sin conexión. Revisa el internet y vuelve a intentar (la venta NO se guardó).");
    } finally {
      setEnviando(false);
    }
  };

  const imprimirCierre = (c: Cierre) => { setCierre(c); setImprimir("caja"); setTimeout(() => window.print(), 250); };
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  const bloqueada = !caja?.abierta;

  return (
    <>
      <main className="contenedor pantalla">
        {sinPermiso && <div className="aviso" style={{ marginBottom: 14 }}>Esa sección requiere la clave de administrador.</div>}
        <PanelCaja puesto={puesto} caja={caja} recargar={cargarCaja} onCierre={imprimirCierre} imprimirCierre={imprimirCierre} />
        {cierre && imprimir === "caja" && (
          <div className="aviso" style={{ marginBottom: 16 }}>
            ✅ Caja cerrada · diferencia <b>{pesos(cierre.caja.diferencia)}</b>
            {cierre.envio?.correo && cierre.envio.correo !== "no configurado" && <> · Informe por correo: {cierre.envio.correo}</>}
            {cierre.envio?.whatsapp && <><br />💬 Informe por WhatsApp: {cierre.envio.whatsapp}</>}
            <div className="acciones">
              <button className="btn chico" onClick={() => imprimirCierre(cierre)}>🖨️ Reimprimir informe</button>
              {cierre.pdf && <a className="btn sec chico" target="_blank" rel="noreferrer" href={cierre.pdf}>📄 Descargar PDF</a>}
              {cierre.whatsapp_admin && <a className="btn wa chico" target="_blank" rel="noreferrer" href={cierre.whatsapp_admin}>Enviar resumen al administrador por WhatsApp</a>}
            </div>
          </div>
        )}
        <div className="grid-2">
          <form className="tarjeta" onSubmit={vender} style={bloqueada ? { opacity: .45, pointerEvents: "none" } : undefined}>
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
            <label>Correo (opcional: le llega la entrada con el QR)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@correo.com" />

            <label>Fecha de visita</label>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {fechas.map((f) => <option key={f} value={f}>{fechaCorta(f)} — {fechaLarga(f)}</option>)}
            </select>

            <div className="contadores">
              <Contador titulo="Adultos" sub={pesos(precios.adulto)} valor={adultos} set={setAdultos} />
              <Contador titulo="Niños de 6 a 14 años" sub={pesos(precios.nino)} valor={ninos} set={setNinos} />
              <Contador titulo="Menores de 6 años" sub="Gratis" valor={menores} set={setMenores} />
            </div>
            <p className="suave" style={{ fontSize: ".85rem", margin: "8px 0 0" }}>Se genera <b>un solo QR</b> para todo el grupo: entran juntos con un escaneo.</p>

            <label>Método de pago</label>
            <div className="metodos" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {METODOS.map(([v, t]) => (
                <button type="button" key={v} className={metodo === v ? "activo" : ""} onClick={() => setMetodo(v)}>{t}</button>
              ))}
            </div>
            {metodo !== "efectivo" && (
              <>
                <label>{metodo === "datafono" ? "N.º de aprobación del voucher" : "Referencia / número de la transacción"}</label>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej: M4512873" />
              </>
            )}
            {aVerificar && (
              <div className="aviso" style={{ marginTop: 10 }}>
                Revisa en el celular del negocio que el pago <b>sí llegó</b> antes de entregar la entrada. Toma foto del comprobante del cliente:
                el administrador lo verifica contra la cuenta.
                <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ marginTop: 8 }}
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
              </div>
            )}

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

            <CamposFactura activa={factura} setActiva={setFactura} f={datosFactura} setF={setDatosFactura} />
            <CasillaDatos valor={acepta} set={setAcepta} texto="El comprador autoriza el tratamiento de sus datos personales" />

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

            <button className="btn grande" style={{ marginTop: 16 }} disabled={enviando || !acepta}>
              {enviando ? "Guardando…" : `Vender entrada (${adultos + ninos + menores} persona${adultos + ninos + menores === 1 ? "" : "s"})`}
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
                <p style={{ fontSize: ".85rem" }}>Puesto: <b>{puesto}</b></p>
              </div>
            ) : (
              <>
                <h2>✅ Venta #{compra.id} · {pesos(compra.total)}</h2>
                <p className="suave" style={{ marginTop: -6 }}>
                  {compra.nombre} · {compra.celular} · {fechaLarga(compra.fecha_visita)}
                  <br />{NOMBRE_METODO[compra.metodo_pago] ?? compra.metodo_pago}{compra.referencia_pago ? ` · Ref. ${compra.referencia_pago}` : ""}
                  {compra.verificacion === "pendiente" && <> · <span style={{ color: "#ffc46b" }}>pago por verificar</span></>}
                  {compra.requiere_factura && <><br />🧾 Pendiente factura electrónica</>}
                  {estadoFoto && <><br />{estadoFoto}</>}
                  {envio && envio.correo !== "no configurado" && <><br />✉️ Correo: {envio.correo}</>}
                  {envio && envio.whatsapp !== "no configurado" && <><br />💬 WhatsApp automático: {envio.whatsapp === "enviado" ? <b style={{ color: "#5be08a" }}>✅ enviado al cliente, no hay que hacer nada más</b> : envio.whatsapp}</>}
                </p>
                <div className="acciones" style={{ marginBottom: 14 }}>
                  <button className="btn" onClick={() => { setImprimir("boletas"); setTimeout(() => window.print(), 100); }}>🖨️ Imprimir</button>
                  {envio?.whatsapp === "enviado"
                    ? <a className="btn sec" target="_blank" rel="noreferrer" title="Ya se envió automático. Úsalo solo si el cliente dice que no le llegó." href={linkWhatsApp(compra, origen, fechaLarga)}>Reenviar manual</a>
                    : <a className="btn wa" target="_blank" rel="noreferrer" href={linkWhatsApp(compra, origen, fechaLarga)}>WhatsApp</a>}
                  <a className="btn sec" target="_blank" rel="noreferrer" href={`/c/${compra.token}`}>Ver enlace</a>
                </div>
                <div className="boletas-lista" style={{ maxHeight: "62vh", overflow: "auto", paddingRight: 4 }}>
                  <GrupoPantalla c={compra} />
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {imprimir === "caja" && cierre
        ? <div id="zona-impresion"><ReporteCaja r={cierre} taquilla={puesto} /></div>
        : <ZonaImpresion compra={compra} />}
    </>
  );
}
