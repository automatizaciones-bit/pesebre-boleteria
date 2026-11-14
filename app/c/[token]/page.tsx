import { notFound } from "next/navigation";
import { db, conTokens, CompraDB } from "@/lib/db";
import { BoletaPantalla } from "@/components/Boletas";
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
      <div className="aviso" style={{ textAlign: "left", marginBottom: 16 }}>
        Muestra cada código QR en la entrada. <b>Cada código sirve una sola vez</b> y sólo el día indicado.
        Sube el brillo de la pantalla para escanear más rápido.
      </div>
      <div className="boletas-lista">
        {compra.boletas.map((b, i) => <BoletaPantalla key={b.id} b={b} c={compra} i={i} />)}
      </div>
    </main>
  );
}
