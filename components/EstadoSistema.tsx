"use client";
import { useEffect, useState } from "react";

type Salud = { ok: boolean; problemas: string[]; modo_prueba: boolean };

/** Banner que avisa al personal si la configuración del sistema tiene un problema. */
export default function EstadoSistema() {
  const [s, setS] = useState<Salud | null>(null);
  useEffect(() => {
    fetch("/api/salud", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {});
  }, []);
  if (!s) return null;
  if (!s.ok) return (
    <div className="contenedor no-imprimir" style={{ paddingBottom: 0 }}>
      <div className="error">
        <b>⚠ El sistema no está listo para vender:</b>
        <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{s.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
    </div>
  );
  if (s.modo_prueba) return (
    <div className="contenedor no-imprimir" style={{ paddingBottom: 0 }}>
      <div className="aviso">🧪 Modo prueba activo: se puede vender para hoy. Antes del 4 de diciembre poner MODO_PRUEBA=0 en Vercel.</div>
    </div>
  );
  return null;
}
