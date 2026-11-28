"use client";
import { useEffect, useState } from "react";

type U = { id: number; nombre: string; rol: "vendedor" | "portero" | "admin"; prueba: boolean; activo: boolean; celular: string | null; ultimo_ingreso: string | null };
const ROL: Record<string, string> = { vendedor: "Vendedor (taquilla + portería)", portero: "Portero / vigilante (solo portería)", admin: "Administrador" };
const fecha = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "nunca");

export default function Usuarios() {
  const [lista, setLista] = useState<U[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", clave: "", rol: "vendedor", prueba: false, celular: "" });
  const [claves, setClaves] = useState<{ nombre: string; clave: string }[] | null>(null);
  const [cambiando, setCambiando] = useState<number | null>(null);
  const [claveNueva, setClaveNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = () => fetch("/api/usuarios", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    if (d.error) setMsg({ ok: false, txt: d.error }); else setLista(d.usuarios);
  });
  useEffect(() => { cargar(); }, []);

  const post = async (url: string, cuerpo: object) => {
    setOcupado(true); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, txt: d.error || "Error" }); return null; }
    cargar();
    return d;
  };

  const reales = (lista ?? []).filter((u) => !u.prueba);
  const cap = (lista ?? []).filter((u) => u.prueba);

  const Tabla = ({ us }: { us: U[] }) => (
    <table className="grupo-tabla" style={{ width: "100%" }}>
      <thead><tr><th style={{ textAlign: "left" }}>Usuario</th><th style={{ textAlign: "left" }}>Rol</th><th style={{ textAlign: "left" }}>Último ingreso</th><th></th></tr></thead>
      <tbody>
        {us.map((u) => (
          <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.5 }}>
            <td><b>{u.nombre}</b>{!u.activo && " (desactivado)"}{u.celular && <><br /><span className="suave">{u.celular}</span></>}</td>
            <td>{ROL[u.rol]}</td>
            <td>{fecha(u.ultimo_ingreso)}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {cambiando === u.id ? (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <input style={{ width: 130 }} value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} placeholder="Clave nueva" />
                  <button className="btn chico" disabled={ocupado || claveNueva.length < 6}
                    onClick={async () => { if (await post("/api/usuarios", { accion: "clave", id: u.id, clave: claveNueva })) { setMsg({ ok: true, txt: `Clave de ${u.nombre} cambiada.` }); setCambiando(null); setClaveNueva(""); } }}>Guardar</button>
                  <button className="btn sec chico" onClick={() => setCambiando(null)}>✕</button>
                </span>
              ) : (
                <>
                  <button className="btn sec chico" onClick={() => { setCambiando(u.id); setClaveNueva(""); }}>Cambiar clave</button>{" "}
                  <button className="btn sec chico" disabled={ocupado} onClick={() => post("/api/usuarios", { accion: "activo", id: u.id, activo: !u.activo })}>{u.activo ? "Desactivar" : "Activar"}</button>
                </>
              )}
            </td>
          </tr>
        ))}
        {us.length === 0 && <tr><td colSpan={4} className="suave">Todavía no hay usuarios.</td></tr>}
      </tbody>
    </table>
  );

  return (
    <main className="contenedor pantalla">
      <h1>👥 Usuarios</h1>
      <p className="suave">Cada persona entra con <b>su nombre de usuario y su clave</b>. Sus ventas y su caja quedan a su nombre.</p>
      {msg && <div className={msg.ok ? "aviso" : "error"} style={{ marginBottom: 12 }}>{msg.txt}</div>}

      <section className="tarjeta">
        <h2>Crear usuario</h2>
        <div className="fila">
          <div><label>Nombre (así entra al sistema)</label><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej: Kenide Gómez" /></div>
          <div><label>Clave (mínimo 6)</label><input value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} placeholder="Ej: 482913" /></div>
        </div>
        <div className="fila">
          <div><label>Rol</label>
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
              {Object.entries(ROL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div><label>Celular (opcional)</label><input inputMode="tel" value={nuevo.celular} onChange={(e) => setNuevo({ ...nuevo, celular: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={nuevo.prueba} onChange={(e) => setNuevo({ ...nuevo, prueba: e.target.checked })} />
          Usuario de capacitación (sus datos van aparte y no se mezclan con los reales)
        </label>
        <button className="btn" style={{ marginTop: 12 }} disabled={ocupado || nuevo.nombre.trim().length < 3 || nuevo.clave.length < 6}
          onClick={async () => {
            if (await post("/api/usuarios", { accion: "crear", ...nuevo })) {
              setMsg({ ok: true, txt: `Usuario «${nuevo.nombre.trim()}» creado. Entrega la clave en persona.` });
              setNuevo({ nombre: "", clave: "", rol: "vendedor", prueba: false, celular: "" });
            }
          }}>Crear usuario</button>
      </section>

      <section className="tarjeta">
        <h2>Personal real</h2>
        {lista ? <Tabla us={reales} /> : <p>Cargando…</p>}
      </section>

      <section className="tarjeta" style={{ borderColor: "#e98a15" }}>
        <h2>🧪 Capacitación</h2>
        <p className="suave">Usuarios para practicar: venden, abren y cierran caja, mandan WhatsApp y escanean en portería igual que el personal real,
          pero todo queda en un ambiente aparte. Sus QR <b>no sirven</b> en la portería real.</p>
        <button className="btn sec" disabled={ocupado} onClick={async () => {
          const d = await post("/api/usuarios", { accion: "capacitacion", cantidad: 5 });
          if (d) setClaves(d.creados);
        }}>Crear 5 usuarios de capacitación</button>
        {claves && claves.length > 0 && (
          <div className="aviso" style={{ marginTop: 12 }}>
            <b>Anota estas claves ahora</b> (no se vuelven a mostrar; se pueden cambiar después):
            <table className="grupo-tabla" style={{ marginTop: 8 }}><tbody>
              {claves.map((c) => <tr key={c.nombre}><td>{c.nombre}</td><td><b style={{ fontSize: "1.2rem", letterSpacing: 2 }}>{c.clave}</b></td></tr>)}
            </tbody></table>
          </div>
        )}
        {claves && claves.length === 0 && <div className="aviso" style={{ marginTop: 12 }}>Ya existen los usuarios de capacitación.</div>}
        <div style={{ marginTop: 14 }}>{lista ? <Tabla us={cap} /> : null}</div>

        <h3 style={{ marginTop: 22 }}>Borrar datos de capacitación</h3>
        <p className="suave">Elimina todas las ventas, QR, escaneos y cajas de práctica. <b>No toca ningún dato real.</b> Los usuarios de capacitación se conservan.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ width: 180 }} value={confirmar} onChange={(e) => setConfirmar(e.target.value.toUpperCase())} placeholder="Escribe BORRAR" />
          <button className="btn" style={{ background: "#d92d2d", color: "#fff" }} disabled={ocupado || confirmar !== "BORRAR"} onClick={async () => {
            const d = await post("/api/capacitacion", { confirmar: "BORRAR" });
            if (d) { setMsg({ ok: true, txt: `Capacitación borrada: ${d.compras} ventas, ${d.boletas} boletas, ${d.escaneos} escaneos y ${d.cajas} cajas.` }); setConfirmar(""); }
          }}>Borrar datos de capacitación</button>
        </div>
        <p style={{ marginTop: 10 }}><a href="/panel?prueba=1">Ver el panel de capacitación →</a></p>
      </section>
      <p><a href="/panel">← Volver al panel</a></p>
    </main>
  );
}
