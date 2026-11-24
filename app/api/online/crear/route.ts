import { json } from "@/lib/db";
import { limpiar, validar, guardarCompra } from "@/lib/ventas";
import { urlCheckout, wompi } from "@/lib/wompi";

// Compra en línea (pública): crea la compra PENDIENTE y devuelve la URL de pago de Wompi.
// Las boletas no sirven en la puerta hasta que Wompi confirme el pago.
export async function POST(req: Request) {
  if (!wompi().activo) return json({ error: "La venta en línea todavía no está habilitada. Compra en taquilla." }, 503);
  const b = await req.json().catch(() => ({}));
  if (b.sitio_web) return json({ error: "Solicitud inválida" }, 400);          // trampa para robots
  const d = limpiar(b, "online", "En línea");
  d.sin_adulto_ok = true;
  const v = validar(d);
  if (v) return json(v, 400);
  if (d.adultos + d.ninos === 0) return json({ error: "Los menores de 6 años entran gratis, pero deben ir con una boleta paga." }, 400);

  const r = await guardarCompra(d);
  if (r.error || !r.compra) return json({ error: r.error ?? "No se pudo crear la compra" }, 500);
  const c = r.compra;
  const origen = new URL(req.url).origin;
  return json({
    url: urlCheckout({
      referencia: c.token, centavos: c.total * 100, email: d.email, nombre: d.nombre,
      celular: d.celular, cedula: d.cedula, redirect: `${origen}/comprar/resultado?ref=${c.token}`,
    }),
  });
}
