import { notFound } from "next/navigation";
import { db, conTokens, CompraDB } from "@/lib/db";
import { GrupoPantalla } from "@/components/Boletas";
import type { Compra } from "@/components/tipos";
import { fechaLarga } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tus boletas · El Gran Pesebre de Tenjo 2026", robots: "noindex" };

// Página PÚBLICA que recibe el cliente por WhatsApp. El token largo (16 caracteres aleatorios)
// es lo que la protege: sólo quien tiene el enlace puede ver estas boletas.
export default async function MisBoletas({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Z2-9]{16}$/.test(token)) notFound();
  const { data } = await db().from("compras").select("*, boletas(*)").eq("token", token).maybeSingle();
  if (!data) notFound();
  const compra = (await conTokens(data as CompraDB)) as Compra;

  return (
    <main className="publica">
      <img src="/logo.png" alt="El Gran Pesebre de Tenjo 2026" />
      <h1 style={{ marginTop: 6 }}>Tus boletas</h1>
      <p className="suave" style={{ marginTop: -4 }}>
        {compra.nombre} · {fechaLarga(compra.fecha_visita)}
      </p>
      {compra.anulada && <div className="error">Esta compra fue anulada.</div>}
      {!compra.anulada && compra.estado_pago === "pendiente" && (
        <div className="aviso">⏳ Tu pago todavía se está confirmando. Las boletas se activan apenas se apruebe; recarga esta página en unos minutos.</div>
      )}
      {!compra.anulada && compra.estado_pago === "rechazado" && (
        <div className="error">El pago no fue aprobado, así que estas boletas no son válidas. <a href="/comprar">Volver a comprar</a></div>
      )}
      {compra.canal === "cortesia" && <div className="aviso" style={{ marginBottom: 10 }}>🎁 Cortesía</div>}
      <div className="aviso" style={{ textAlign: "left", marginBottom: 16 }}>
        Muestra este código QR en la entrada. <b>Sirve una sola vez</b> para todo el grupo y sólo el día indicado.
        Sube el brillo de la pantalla para escanear más rápido.
      </div>
      <div className="boletas-lista">
        <GrupoPantalla c={compra} />
      </div>
    </main>
  );
}
