"use client";
import { useState } from "react";

const PUESTOS = ["Taquilla 1", "Taquilla 2", "Puerta 1", "Puerta 2", "Puerta 3", "Administración"];

export default function Login() {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true); setError("");
    const r = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, clave }),
    });
    const d = await r.json();
    setCargando(false);
    if (!r.ok) return setError(d.error);
    location.href = d.destino;
  };

  return (
    <main className="login">
      <img src="/logo.png" alt="Pesebre Tenjo 2026" />
      <form className="tarjeta" onSubmit={entrar} style={{ textAlign: "left" }}>
        <h2 style={{ textAlign: "center" }}>Ingreso del personal</h2>
        <label>Puesto</label>
        <input list="puestos" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Taquilla 1" autoFocus />
        <datalist id="puestos">{PUESTOS.map((p) => <option key={p} value={p} />)}</datalist>
        <label>Clave</label>
        <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button className="btn grande" style={{ marginTop: 18 }} disabled={cargando}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
