import Qr from "./Qr";
import { Compra, Boleta, cedulaOculta, describirGrupo, personas } from "./tipos";
import { NOMBRE_TIPO, fechaLarga, pesos, EVENTO_NOMBRE } from "@/lib/config";

function legible(t: string) { return t.replace(/(.{4})/g, "$1 ").trim(); }

/** Boleta para ver en el celular (página pública y vista previa en taquilla). */
export function BoletaPantalla({ b, c, i }: { b: Boleta; c: Compra; i: number }) {
  return (
    <div className="boleta">
      <img className="logo" src="/logo.png" alt="Pesebre Tenjo 2026" />
      <div className="fecha">{fechaLarga(b.fecha_visita)}</div>
      <div className="tipo-b">{NOMBRE_TIPO[b.tipo].toUpperCase()}{c.canal === "cortesia" ? " · CORTESÍA" : ""}</div>
      <div className="qr"><Qr texto={b.token} /></div>
      <div className="codigo">{legible(b.token)}</div>
      <div className="titular">{c.nombre} · CC {cedulaOculta(c.cedula)}</div>
      <div className="suave" style={{ fontSize: ".85rem", marginTop: 4 }}>
        Boleta {i + 1} de {c.boletas.length}
      </div>
      {b.estado === "usada" && <div className="sello">USADA</div>}
      {b.estado === "anulada" && <div className="sello">ANULADA</div>}
      {b.estado === "pendiente" && <div className="sello" style={{ color: "#ffd97a" }}>PAGO PENDIENTE</div>}
    </div>
  );
}

/** Boleta en formato tirilla térmica de 80 mm (sólo aparece al imprimir). */
export function BoletaTermica({ b, c, i }: { b: Boleta; c: Compra; i: number }) {
  const hora = new Date(c.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
  return (
    <div className="termica">
      <img className="logo" src="/logo-print.png" alt="" />
      <div className="t-evento">{EVENTO_NOMBRE}</div>
      <div className="t-linea" />
      <div>FECHA DE VISITA</div>
      <div className="t-fecha">{fechaLarga(b.fecha_visita).toUpperCase()}</div>
      <div className="t-tipo">{NOMBRE_TIPO[b.tipo].toUpperCase()}</div>
      {c.canal === "cortesia" && <div className="t-tipo" style={{ marginTop: 0 }}>CORTESÍA</div>}
      <div className="t-qr"><Qr texto={b.token} /></div>
      <div className="t-cod">{legible(b.token)}</div>
      <div className="t-linea" />
      <div className="t-dato"><span>Titular:</span><b>{c.nombre}</b></div>
      <div className="t-dato"><span>Cédula:</span><span>{cedulaOculta(c.cedula)}</span></div>
      <div className="t-dato"><span>Valor:</span><span>{c.canal === "cortesia" ? "Cortesía" : b.precio ? pesos(b.precio) : "Gratis"}</span></div>
      <div className="t-dato"><span>Boleta:</span><span>{i + 1} de {c.boletas.length} · Compra #{c.id}</span></div>
      <div className="t-dato"><span>Venta:</span><span>{hora}</span></div>
      <div className="t-dato"><span>Taquilla:</span><span>{c.taquilla}</span></div>
      <div className="t-linea" />
      <div className="t-legal">
        Válida para UN (1) ingreso, sólo en la fecha indicada. El código QR se invalida al
        ingresar. Conserve esta boleta hasta salir. No se aceptan copias usadas.
        Sus datos se tratan según la Ley 1581 de 2012 (ver /privacidad).
      </div>
    </div>
  );
}

/** Estado del grupo según sus boletas. */
export function estadoGrupo(c: Compra): "valida" | "usada" | "anulada" | "pendiente" {
  if (c.anulada || c.estado_pago === "rechazado") return "anulada";
  if (c.boletas.some((b) => b.estado === "pendiente")) return "pendiente";
  if (c.boletas.length > 0 && c.boletas.every((b) => b.estado === "usada" || b.estado === "anulada")) return "usada";
  return "valida";
}

function Composicion({ c, termica }: { c: Compra; termica?: boolean }) {
  const cortesia = c.canal === "cortesia";
  const filas: [string, number, number][] = [
    ["Adultos", c.adultos, cortesia ? 0 : (c.boletas.find((b) => b.tipo === "adulto")?.precio ?? 0)],
    ["Niños 6-14", c.ninos, cortesia ? 0 : (c.boletas.find((b) => b.tipo === "nino")?.precio ?? 0)],
    ["Menores de 6", c.menores, 0],
  ];
  return (
    <div className={termica ? "" : "grupo-tabla"}>
      {filas.filter(([, n]) => n > 0).map(([t, n, p]) => (
        <div key={t} className={termica ? "t-dato" : "grupo-fila"}>
          <span>{n} × {t}</span><span>{cortesia ? "Cortesía" : p ? pesos(n * p) : "Gratis"}</span>
        </div>
      ))}
      <div className={termica ? "t-dato" : "grupo-fila total"}>
        <b>{personas(c)} persona{personas(c) > 1 ? "s" : ""}</b><b>{cortesia ? "Cortesía" : pesos(c.total)}</b>
      </div>
    </div>
  );
}

/** Entrada de GRUPO (un QR por compra) para el celular. */
export function GrupoPantalla({ c }: { c: Compra }) {
  if (!c.qr) return <>{c.boletas.map((b, i) => <BoletaPantalla key={b.id} b={b} c={c} i={i} />)}</>;
  const est = estadoGrupo(c);
  const n = personas(c);
  return (
    <div className="boleta">
      <img className="logo" src="/logo.png" alt="Pesebre Tenjo 2026" />
      <div className="fecha">{fechaLarga(c.fecha_visita)}</div>
      <div className="tipo-b">{n > 1 ? `ENTRADA GRUPO · ${n} PERSONAS` : "ENTRADA · 1 PERSONA"}{c.canal === "cortesia" ? " · CORTESÍA" : ""}</div>
      <div className="qr"><Qr texto={c.qr} /></div>
      <div className="codigo">{legible(c.qr)}</div>
      <Composicion c={c} />
      <div className="titular">{c.nombre} · CC {cedulaOculta(c.cedula)}</div>
      {n > 1 && <div className="suave" style={{ fontSize: ".85rem", marginTop: 4 }}>Todo el grupo entra junto con un solo escaneo.</div>}
      {est === "usada" && <div className="sello">USADA</div>}
      {est === "anulada" && <div className="sello">ANULADA</div>}
      {est === "pendiente" && <div className="sello" style={{ color: "#ffd97a" }}>PAGO PENDIENTE</div>}
    </div>
  );
}

/** Entrada de GRUPO en tirilla térmica de 80 mm. */
export function GrupoTermica({ c }: { c: Compra }) {
  const hora = new Date(c.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
  const n = personas(c);
  return (
    <div className="termica">
      <img className="logo" src="/logo-print.png" alt="" />
      <div className="t-evento">{EVENTO_NOMBRE}</div>
      <div className="t-linea" />
      <div>FECHA DE VISITA</div>
      <div className="t-fecha">{fechaLarga(c.fecha_visita).toUpperCase()}</div>
      <div className="t-tipo">{n > 1 ? `GRUPO DE ${n} PERSONAS` : "1 PERSONA"}</div>
      {c.canal === "cortesia" && <div className="t-tipo" style={{ marginTop: 0 }}>CORTESÍA</div>}
      <div className="t-qr"><Qr texto={c.qr!} /></div>
      <div className="t-cod">{legible(c.qr!)}</div>
      <div className="t-linea" />
      <Composicion c={c} termica />
      <div className="t-linea" />
      <div className="t-dato"><span>Titular:</span><b>{c.nombre}</b></div>
      <div className="t-dato"><span>Cédula:</span><span>{cedulaOculta(c.cedula)}</span></div>
      <div className="t-dato"><span>Compra:</span><span>#{c.id} · {hora}</span></div>
      <div className="t-dato"><span>Taquilla:</span><span>{c.taquilla}</span></div>
      <div className="t-linea" />
      <div className="t-legal">
        Válida para UN (1) ingreso del grupo completo, sólo en la fecha indicada. El código QR se
        invalida al ingresar. Conserve esta boleta hasta salir.
        Sus datos se tratan según la Ley 1581 de 2012 (ver /privacidad).
      </div>
    </div>
  );
}

/** Contenedor que sólo se ve al imprimir (window.print()). Una tirilla por compra (grupo). */
export function ZonaImpresion({ compra, compras }: { compra?: Compra | null; compras?: Compra[] }) {
  const lista = (compras ?? (compra ? [compra] : [])).filter((c) => !c.anulada);
  return (
    <div id="zona-impresion">
      {lista.map((c) => c.qr
        ? <GrupoTermica key={c.id} c={c} />
        : c.boletas.filter((b) => b.estado !== "anulada").map((b, i) => <BoletaTermica key={c.id + "-" + b.id} b={b} c={c} i={i} />))}
    </div>
  );
}
