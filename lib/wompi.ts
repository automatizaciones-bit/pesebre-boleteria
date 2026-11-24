import { createHash, timingSafeEqual } from "crypto";

// Integración con Wompi (Bancolombia): tarjetas, PSE, Nequi, botón Bancolombia.
// Variables en Vercel: VENTA_ONLINE=1, WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET, WOMPI_EVENTS_SECRET
// Las llaves de prueba empiezan por pub_test_ (usa el sandbox); las de producción por pub_prod_.

export function wompi() {
  const pub = process.env.WOMPI_PUBLIC_KEY?.trim();
  const integridad = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  const eventos = process.env.WOMPI_EVENTS_SECRET?.trim();
  const sandbox = !!pub?.startsWith("pub_test_");
  return {
    pub, integridad, eventos, sandbox,
    activo: process.env.VENTA_ONLINE === "1" && !!pub && !!integridad,
    api: sandbox ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1",
  };
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Firma de integridad que exige el checkout: SHA256(referencia + centavos + moneda + secreto). */
export function firmaIntegridad(referencia: string, centavos: number, moneda: string, secreto: string) {
  return sha256(`${referencia}${centavos}${moneda}${secreto}`);
}

export function urlCheckout(o: {
  referencia: string; centavos: number; email: string; nombre: string; celular: string; cedula: string; redirect: string;
}) {
  const w = wompi();
  if (!w.pub || !w.integridad) throw new Error("Wompi no está configurado");
  const q = new URLSearchParams({
    "public-key": w.pub,
    currency: "COP",
    "amount-in-cents": String(o.centavos),
    reference: o.referencia,
    "signature:integrity": firmaIntegridad(o.referencia, o.centavos, "COP", w.integridad),
    "redirect-url": o.redirect,
    "customer-data:email": o.email,
    "customer-data:full-name": o.nombre,
    "customer-data:phone-number": o.celular,
    "customer-data:phone-number-prefix": "+57",
    "customer-data:legal-id": o.cedula,
    "customer-data:legal-id-type": "CC",
  });
  return `https://checkout.wompi.co/p/?${q.toString()}`;
}

type Evento = {
  event?: string; timestamp?: number;
  data?: { transaction?: Transaccion };
  signature?: { properties?: string[]; checksum?: string };
};
export type Transaccion = { id: string; status: string; reference: string; amount_in_cents: number };

/** Verifica el checksum de un evento: SHA256(valores de signature.properties + timestamp + secreto de eventos). */
export function eventoAutentico(ev: Evento, secreto: string): boolean {
  const props = ev.signature?.properties;
  const checksum = ev.signature?.checksum;
  if (!Array.isArray(props) || !checksum || ev.timestamp === undefined) return false;
  const valores = props.map((p) =>
    String(p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], ev.data) ?? "")
  ).join("");
  const calculado = Buffer.from(sha256(`${valores}${ev.timestamp}${secreto}`));
  const recibido = Buffer.from(checksum.toLowerCase());
  return calculado.length === recibido.length && timingSafeEqual(calculado, recibido);
}

/** Consulta una transacción directamente a Wompi (fuente de verdad, no se confía en la URL). */
export async function consultarTransaccion(id: string): Promise<Transaccion | null> {
  if (!/^[\w-]{5,80}$/.test(id)) return null;
  try {
    const r = await fetch(`${wompi().api}/transactions/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}
