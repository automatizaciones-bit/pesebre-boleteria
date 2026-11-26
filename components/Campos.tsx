"use client";
import { pesos } from "@/lib/config";

export function fechaCorta(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function Contador({ titulo, sub, valor, set, max = 30 }: { titulo: string; sub: string; valor: number; set: (n: number) => void; max?: number }) {
  return (
    <div className="contador">
      <div className="tipo"><b>{titulo}</b><span>{sub}</span></div>
      <div className="ctrl">
        <button type="button" onClick={() => set(Math.max(0, valor - 1))}>−</button>
        <input inputMode="numeric" value={valor} onChange={(e) => set(Math.max(0, Math.min(max, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
        <button type="button" onClick={() => set(Math.min(max, valor + 1))}>+</button>
      </div>
    </div>
  );
}

export function CasillaDatos({ valor, set, texto }: { valor: boolean; set: (v: boolean) => void; texto?: string }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontWeight: 400, color: "var(--texto)" }}>
      <input type="checkbox" checked={valor} onChange={(e) => set(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
      <span>{texto ?? "El titular autoriza el tratamiento de sus datos personales"} (<a href="/privacidad" target="_blank">política</a>).</span>
    </label>
  );
}

export type Factura = { tipo_doc: string; numero: string; razon_social: string; email: string };
export const FACTURA_VACIA: Factura = { tipo_doc: "CC", numero: "", razon_social: "", email: "" };

export function CamposFactura({ activa, setActiva, f, setF }: { activa: boolean; setActiva: (v: boolean) => void; f: Factura; setF: (f: Factura) => void }) {
  return (
    <>
      <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", color: "var(--texto)" }}>
        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} style={{ width: "auto" }} />
        Requiere factura electrónica
      </label>
      {activa && (
        <div className="tarjeta" style={{ padding: 12, marginTop: 6 }}>
          <div className="fila" style={{ gridTemplateColumns: "110px 1fr" }}>
            <div>
              <label style={{ marginTop: 0 }}>Tipo</label>
              <select value={f.tipo_doc} onChange={(e) => setF({ ...f, tipo_doc: e.target.value })}>
                <option value="CC">CC</option><option value="NIT">NIT</option><option value="CE">CE</option><option value="PAS">Pasaporte</option>
              </select>
            </div>
            <div>
              <label style={{ marginTop: 0 }}>Número / NIT</label>
              <input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value.replace(/[^0-9-]/g, "") })} />
            </div>
          </div>
          <label>Nombre o razón social</label>
          <input value={f.razon_social} onChange={(e) => setF({ ...f, razon_social: e.target.value })} />
          <label>Correo para la factura</label>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
      )}
    </>
  );
}

export type EstadoCaja = {
  abierta: boolean; base?: number; abierta_at?: string; boletas?: number; anuladas?: number; anuladas_total?: number;
  cajero?: string | null; email?: string | null; total?: number; compras?: number;
  por_metodo?: Record<string, { compras: number; total: number; boletas?: number }>;
  por_tipo?: { adultos: number; ninos: number; menores: number };
  por_verificar?: { compras: number; total: number };
};

export const NOMBRE_METODO: Record<string, string> = {
  efectivo: "Efectivo", datafono: "Datáfono", nequi: "Nequi", bancolombia: "Bancolombia", daviplata: "Daviplata",
  transferencia: "Otro banco", qr: "QR", cortesia: "Cortesía", online: "En línea",
};

export function hora(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "";
}

/** Reporte de cierre de caja en formato tirilla 80 mm. */
export function ReporteCaja({ r, taquilla }: { r: { caja: Record<string, any>; resumen?: EstadoCaja | null }; taquilla: string }) {
  const k = r.caja;
  const res: EstadoCaja = (r.resumen ?? k.resumen ?? { abierta: false }) as EstadoCaja;
  const metodos = Object.entries(res.por_metodo ?? {});
  const signo = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "") + pesos(Math.abs(n));
  return (
    <div className="termica">
      <img className="logo" src="/logo-print.png" alt="" />
      <div className="t-evento">CIERRE DE CAJA</div>
      <div className="t-fecha">{k.taquilla ?? taquilla}</div>
      <div className="t-dato"><span>Cajero:</span><b>{k.cajero ?? "—"}</b></div>
      <div className="t-linea" />
      <div className="t-dato"><span>Apertura:</span><span>{hora(k.abierta_at)}</span></div>
      <div className="t-dato"><span>Cierre:</span><span>{hora(k.cerrada_at)}</span></div>
      <div className="t-linea" />
      {metodos.length === 0 && <div className="t-dato"><span>Sin ventas</span><span>$0</span></div>}
      {metodos.map(([m, v]) => (
        <div className="t-dato" key={m}><span>{NOMBRE_METODO[m] ?? m} ({v.compras})</span><span>{pesos(v.total)}</span></div>
      ))}
      <div className="t-dato"><b>TOTAL VENDIDO</b><b>{pesos(res.total ?? 0)}</b></div>
      <div className="t-dato"><span>Compras / personas:</span><span>{res.compras ?? 0} / {res.boletas ?? 0}</span></div>
      <div className="t-dato"><span>Adult. · Niños · Men.:</span><span>{res.por_tipo?.adultos ?? 0} · {res.por_tipo?.ninos ?? 0} · {res.por_tipo?.menores ?? 0}</span></div>
      <div className="t-dato"><span>Anuladas:</span><span>{res.anuladas ?? 0} · {pesos(res.anuladas_total ?? 0)}</span></div>
      <div className="t-dato"><span>Por verificar:</span><span>{res.por_verificar?.compras ?? 0} · {pesos(res.por_verificar?.total ?? 0)}</span></div>
      <div className="t-linea" />
      <div className="t-dato"><span>Base inicial:</span><span>{pesos(k.base)}</span></div>
      <div className="t-dato"><span>+ Efectivo vendido:</span><span>{pesos(k.efectivo_sistema)}</span></div>
      <div className="t-dato"><b>= Debe haber:</b><b>{pesos(k.base + k.efectivo_sistema)}</b></div>
      <div className="t-dato"><span>Contado:</span><span>{pesos(k.contado)}</span></div>
      <div className="t-dato"><b>DIFERENCIA:</b><b>{signo(k.diferencia)}</b></div>
      {k.notas && <div className="t-legal" style={{ marginTop: 6 }}>Notas: {k.notas}</div>}
      <div className="t-linea" />
      <div className="t-legal" style={{ marginTop: 14 }}>Firma cajero: ______________________</div>
      <div className="t-legal" style={{ marginTop: 14 }}>Firma supervisor: __________________</div>
    </div>
  );
}

/** Reduce una foto a JPG de máx. 1400 px para subirla rápido. */
export async function comprimirFoto(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const esc = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * esc); cv.height = Math.round(bmp.height * esc);
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b ?? f), "image/jpeg", 0.75));
  } catch {
    return f;
  }
}
