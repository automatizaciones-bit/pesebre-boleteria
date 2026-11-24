import Qr from "./Qr";
import { Compra, Boleta, cedulaOculta } from "./tipos";
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

/** Contenedor que sólo se ve al imprimir (window.print()). Acepta una o varias compras. */
export function ZonaImpresion({ compra, compras }: { compra?: Compra | null; compras?: Compra[] }) {
  const lista = compras ?? (compra ? [compra] : []);
  return (
    <div id="zona-impresion">
      {lista.flatMap((c) => c.boletas.filter((b) => b.estado !== "anulada").map((b, i) => (
        <BoletaTermica key={c.id + "-" + b.id} b={b} c={c} i={i} />
      )))}
    </div>
  );
}
