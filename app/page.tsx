import Link from "next/link";
import { sesionActual } from "@/lib/db";

export default async function Inicio() {
  const s = await sesionActual();
  const u = s?.nombre;
  return (
    <main className="contenedor pantalla" style={{ textAlign: "center" }}>
      <img src="/logo.png" alt="Pesebre Tenjo 2026" style={{ width: 260, marginTop: 10 }} />
      <h1>Boletería</h1>
      <p className="suave">Hola, {u}. ¿Qué vas a hacer?</p>
      <div className="kpis" style={{ maxWidth: 760, margin: "24px auto" }}>
        <Link href="/taquilla" className="tarjeta" style={{ textDecoration: "none" }}><h2>🎟️ Taquilla</h2><p className="suave">Vender e imprimir boletas</p></Link>
        <Link href="/porteria" className="tarjeta" style={{ textDecoration: "none" }}><h2>📷 Portería</h2><p className="suave">Escanear e invalidar</p></Link>
        {s?.rol === "admin" && <Link href="/cortesias" className="tarjeta" style={{ textDecoration: "none" }}><h2>🎁 Cortesías</h2><p className="suave">Crear y enviar cortesías</p></Link>}
        {s?.rol === "admin" && <Link href="/panel" className="tarjeta" style={{ textDecoration: "none" }}><h2>📊 Panel</h2><p className="suave">Caja, aforo, anulaciones y Excel</p></Link>}
      </div>
    </main>
  );
}
