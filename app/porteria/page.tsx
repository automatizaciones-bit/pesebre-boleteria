"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fechaLarga } from "@/lib/config";

type Res = {
  resultado: string; tipo?: string; nombre?: string; cedula?: string; fecha_visita?: string;
  usada_at?: string; puerta?: string; grupo_total?: number; grupo_usadas?: number;
  canal?: string; motivo?: string;
};

const TIPO: Record<string, string> = { adulto: "ADULTO", nino: "NIÑO 6–14", menor: "MENOR DE 6" };

function hora(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }) : "";
}

// Sonidos sin archivos: pitido agudo = pasa, zumbido grave = no pasa
let audio: AudioContext | null = null;
function sonar(ok: boolean) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = ok ? "sine" : "square";
    o.frequency.value = ok ? 1250 : 180;
    g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + (ok ? 0.15 : 0.6));
    if (!ok) navigator.vibrate?.([200, 80, 200]);
  } catch {}
}

function Pantalla({ r }: { r: Res | null }) {
  if (!r) return (
    <div className="resultado espera">
      <div className="medio">Listo para escanear</div>
      <div>Pasa el código QR por el lector</div>
    </div>
  );
  switch (r.resultado) {
    case "ok": return (
      <div className="resultado ok">
        <div className="grande">✔ PUEDE INGRESAR</div>
        <div className="grande">{TIPO[r.tipo ?? ""]}</div>
        {r.canal === "cortesia" && <div className="medio" style={{ background: "#5b2a86", borderRadius: 12, padding: "6px 14px", alignSelf: "center" }}>🎁 CORTESÍA{r.motivo ? ` · ${r.motivo}` : ""}</div>}
        {r.canal === "online" && <div className="medio">🌐 Compra en línea</div>}
        <div className="medio">{r.nombre} · CC {r.cedula}</div>
        {(r.grupo_total ?? 0) > 1 && <div>Grupo: {r.grupo_usadas} de {r.grupo_total} ya ingresaron</div>}
      </div>
    );
    case "usada": return (
      <div className="resultado malo">
        <div className="grande">✖ YA FUE USADA</div>
        <div className="medio">Ingresó a las {hora(r.usada_at)} por {r.puerta}</div>
        <div>{r.nombre} · CC {r.cedula}</div>
      </div>
    );
    case "otra_fecha": return (
      <div className="resultado alerta">
        <div className="grande">⚠ OTRA FECHA</div>
        <div className="medio">Esta boleta es para el {fechaLarga(r.fecha_visita ?? "")}</div>
        <div>{r.nombre} · CC {r.cedula}</div>
      </div>
    );
    case "pendiente_pago": return (
      <div className="resultado alerta"><div className="grande">⚠ PAGO SIN CONFIRMAR</div><div className="medio">Compra en línea aún no pagada. Envíe a taquilla.</div><div>{r.nombre} · CC {r.cedula}</div></div>
    );
    case "anulada": return (
      <div className="resultado malo"><div className="grande">✖ BOLETA ANULADA</div><div className="medio">No puede ingresar con esta boleta</div></div>
    );
    case "firma_invalida": return (
      <div className="resultado malo"><div className="grande">✖ CÓDIGO FALSO</div><div className="medio">Este código no fue generado por la boletería</div></div>
    );
    case "no_existe": return (
      <div className="resultado malo"><div className="grande">✖ NO REGISTRADA</div><div className="medio">La boleta no existe en el sistema</div></div>
    );
    case "sin_conexion": return (
      <div className="resultado alerta"><div className="grande">SIN CONEXIÓN</div><div className="medio">Revisa internet y vuelve a escanear</div></div>
    );
    default: return (
      <div className="resultado alerta"><div className="grande">ERROR</div><div className="medio">Vuelve a escanear</div></div>
    );
  }
}

export default function Porteria() {
  const [entrada, setEntrada] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [camara, setCamara] = useState(false);
  const [historial, setHistorial] = useState<{ h: string; r: string; n?: string }[]>([]);
  const [ingresos, setIngresos] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupado = useRef(false);
  const ultimo = useRef({ t: "", at: 0 });
  const limpiar = useRef<ReturnType<typeof setTimeout>>(undefined);

  const procesar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (!t || ocupado.current) return;
    // la cámara lee el mismo QR muchas veces por segundo: ignorar repeticiones de 4 s
    if (t === ultimo.current.t && Date.now() - ultimo.current.at < 4000) return;
    ultimo.current = { t, at: Date.now() };
    ocupado.current = true;
    let r: Res;
    try {
      const resp = await fetch("/api/validar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }),
      });
      if (resp.status === 401) { location.href = "/login"; return; }
      r = await resp.json();
    } catch {
      r = { resultado: "sin_conexion" };
      ultimo.current = { t: "", at: 0 }; // permitir reintento inmediato
    }
    ocupado.current = false;
    setRes(r);
    sonar(r.resultado === "ok");
    if (r.resultado === "ok") setIngresos((n) => n + 1);
    setHistorial((h) => [{ h: new Date().toLocaleTimeString("es-CO"), r: r.resultado, n: r.nombre }, ...h].slice(0, 10));
    clearTimeout(limpiar.current);
    limpiar.current = setTimeout(() => setRes(null), r.resultado === "ok" ? 3500 : 7000);
  }, []);

  // Mantener el foco en la caja de texto: el lector USB "escribe" ahí y presiona Enter
  useEffect(() => {
    const i = setInterval(() => {
      if (!camara && document.activeElement !== inputRef.current) inputRef.current?.focus();
    }, 800);
    return () => clearInterval(i);
  }, [camara]);

  // Cámara del celular / tablet
  useEffect(() => {
    if (!camara) return;
    let lector: { stop: () => Promise<void>; isScanning?: boolean } | null = null;
    let cancelado = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelado) return;
      const l = new Html5Qrcode("lector");
      lector = l;
      try {
        await l.start({ facingMode: "environment" }, { fps: 12, qrbox: 260 }, (txt) => procesar(txt), () => {});
      } catch {
        alert("No se pudo abrir la cámara. Revisa los permisos del navegador.");
        setCamara(false);
      }
    })();
    return () => { cancelado = true; if (lector?.isScanning !== false) lector?.stop().catch(() => {}); };
  }, [camara, procesar]);

  return (
    <main className="contenedor pantalla" style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Portería</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="suave">Ingresos en este equipo: <b style={{ color: "var(--oro-claro)", fontSize: "1.3rem" }}>{ingresos}</b></span>
          <button className="btn sec" onClick={() => setCamara((c) => !c)}>{camara ? "⌨️ Usar lector" : "📷 Usar cámara"}</button>
        </div>
      </div>

      {camara ? (
        <div id="lector" />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); procesar(entrada); setEntrada(""); }} style={{ marginTop: 14 }}>
          <input ref={inputRef} className="porteria-entrada" value={entrada} autoFocus autoComplete="off"
            placeholder="Escanea o escribe el código" onChange={(e) => setEntrada(e.target.value)} />
        </form>
      )}

      <Pantalla r={res} />

      <section className="tarjeta" style={{ marginTop: 18 }}>
        <h3>Últimos escaneos</h3>
        <ul className="historial">
          {historial.length === 0 && <li className="suave">Todavía no hay escaneos</li>}
          {historial.map((x, i) => (
            <li key={i}>
              <span>{x.h} · {x.n ?? "—"}</span>
              <b style={{ color: x.r === "ok" ? "#5ee28f" : "#ff9b9b" }}>{x.r === "ok" ? "INGRESÓ" : x.r.toUpperCase().replace("_", " ")}</b>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
