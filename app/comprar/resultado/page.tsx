"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function Resultado() {
  const q = useSearchParams();
  const ref = q.get("ref") ?? "";
  const id = q.get("id") ?? "";
  const [estado, setEstado] = useState("verificando");
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await fetch(`/api/online/estado?ref=${encodeURIComponent(ref)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const d = await r.json();
        if (!vivo) return;
        setEstado(d.estado ?? "error");
        if (d.estado === "pendiente") setTimeout(() => setIntentos((n) => n + 1), 4000);
      } catch { if (vivo) setTimeout(() => setIntentos((n) => n + 1), 4000); }
    };
    revisar();
    return () => { vivo = false; };
  }, [ref, id, intentos]);

  const enlace = typeof window !== "undefined" ? `${location.origin}/c/${ref}` : "";
  return (
    <main className="publica">
      <img src="/logo.png" alt="El Gran Pesebre de Tenjo 2026" />
      {estado === "pagado" ? (
        <>
          <h1>¡Pago aprobado! 🎉</h1>
          <p>Tus boletas ya están listas.</p>
          <div className="acciones" style={{ justifyContent: "center" }}>
            <a className="btn grande" href={`/c/${ref}`}>Ver mis boletas</a>
          </div>
          <p className="suave">Guárdalas: envíate el enlace a tu WhatsApp para tenerlas a mano.</p>
          <a className="btn wa" target="_blank" rel="noreferrer"
             href={`https://wa.me/?text=${encodeURIComponent("🎄 Mis boletas para El Gran Pesebre de Tenjo 2026: " + enlace)}`}>
            Enviar a mi WhatsApp
          </a>
        </>
      ) : estado === "rechazado" || estado === "anulada" ? (
        <>
          <h1>Pago no aprobado</h1>
          <p className="suave">No se realizó ningún cobro. Puedes intentarlo de nuevo.</p>
          <a className="btn" href="/comprar">Volver a intentar</a>
        </>
      ) : estado === "pendiente" || estado === "verificando" ? (
        <>
          <h1>Verificando tu pago…</h1>
          <p className="suave">Esto puede tardar unos segundos (PSE puede tardar algunos minutos). No cierres esta página.</p>
          {intentos > 15 && <p className="aviso">Tu pago sigue en proceso. Cuando se apruebe, tus boletas aparecerán en este enlace: <a href={`/c/${ref}`}>{enlace}</a></p>}
        </>
      ) : (
        <>
          <h1>No encontramos tu compra</h1>
          <p className="suave">Si te cobraron, escríbenos con el comprobante de pago.</p>
        </>
      )}
    </main>
  );
}

export default function Pagina() {
  return <Suspense><Resultado /></Suspense>;
}
