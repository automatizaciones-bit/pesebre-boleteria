export type Boleta = {
  id: number; codigo: string; token: string; tipo: "adulto" | "nino" | "menor";
  precio: number; fecha_visita: string; estado: string; usada_at: string | null; puerta: string | null;
};
export type Compra = {
  id: number; token: string; cedula: string; nombre: string; celular: string;
  fecha_visita: string; adultos: number; ninos: number; menores: number; total: number;
  metodo_pago: string; taquilla: string; anulada: boolean; created_at: string;
  boletas: Boleta[];
};

export function cedulaOculta(c: string) {
  return c.length > 4 ? "•".repeat(c.length - 4) + c.slice(-4) : c;
}

export function linkWhatsApp(c: Compra, origen: string, fechaLarga: (s: string) => string) {
  const primerNombre = c.nombre.split(" ")[0];
  const partes = [
    c.adultos ? `${c.adultos} adulto${c.adultos > 1 ? "s" : ""}` : "",
    c.ninos ? `${c.ninos} niño${c.ninos > 1 ? "s" : ""} (6-14)` : "",
    c.menores ? `${c.menores} menor${c.menores > 1 ? "es" : ""} de 6` : "",
  ].filter(Boolean).join(", ");
  const msg =
`🎄 *El Gran Pesebre de Tenjo 2026* 🎄

Hola ${primerNombre}, ¡gracias por tu compra!

📅 Fecha de visita: *${fechaLarga(c.fecha_visita)}*
🎟️ Boletas: ${partes}

Aquí están tus boletas con código QR:
${origen}/c/${c.token}

Muestra el QR en la entrada (desde el celular o impreso). Cada código sirve *una sola vez* y solo para la fecha indicada. No lo compartas con nadie.`;
  return `https://wa.me/57${c.celular}?text=${encodeURIComponent(msg)}`;
}
