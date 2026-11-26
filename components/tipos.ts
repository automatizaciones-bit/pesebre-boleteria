export type Boleta = {
  id: number; codigo: string; token: string; tipo: "adulto" | "nino" | "menor";
  precio: number; fecha_visita: string; estado: string; usada_at: string | null; puerta: string | null;
};
export type Compra = {
  id: number; token: string; cedula: string; nombre: string; celular: string;
  fecha_visita: string; adultos: number; ninos: number; menores: number; total: number;
  metodo_pago: string; taquilla: string; anulada: boolean; created_at: string;
  canal?: string; estado_pago?: string; email?: string | null; referencia_pago?: string | null;
  autorizado_por?: string | null; motivo?: string | null; anulada_por?: string | null; anulada_motivo?: string | null;
  requiere_factura?: boolean; factura_datos?: Record<string, string> | null;
  codigo?: string | null; qr?: string | null; verificacion?: string; comprobante_path?: string | null;
  verificado_por?: string | null; email_enviado_at?: string | null; whatsapp_enviado_at?: string | null;
  boletas: Boleta[];
};

export function cedulaOculta(c: string) {
  return c.length > 4 ? "•".repeat(c.length - 4) + c.slice(-4) : c;
}

/** "2 adultos, 1 niño (6-14), 1 menor de 6" */
export function describirGrupo(c: { adultos: number; ninos: number; menores: number }) {
  return [
    c.adultos ? `${c.adultos} adulto${c.adultos > 1 ? "s" : ""}` : "",
    c.ninos ? `${c.ninos} niño${c.ninos > 1 ? "s" : ""} (6-14)` : "",
    c.menores ? `${c.menores} menor${c.menores > 1 ? "es" : ""} de 6` : "",
  ].filter(Boolean).join(", ");
}

export function personas(c: { adultos: number; ninos: number; menores: number }) {
  return c.adultos + c.ninos + c.menores;
}

export function linkWhatsApp(c: Compra, origen: string, fechaLarga: (s: string) => string) {
  const primerNombre = c.nombre.split(" ")[0];
  const n = personas(c);
  const msg =
`🎄 *El Gran Pesebre de Tenjo 2026* 🎄

${c.canal === "cortesia" ? `Hola ${primerNombre}, tienes una *cortesía* para visitarnos. ¡Te esperamos!` : `Hola ${primerNombre}, ¡gracias por tu compra!`}

📅 Fecha de visita: *${fechaLarga(c.fecha_visita)}*
👨‍👩‍👧 Entrada ${n > 1 ? `para un grupo de *${n} personas*` : "para *1 persona*"}: ${describirGrupo(c)}

Aquí está tu código QR:
${origen}/c/${c.token}

Muestra el QR en la entrada (desde el celular o impreso).${n > 1 ? " *Todo el grupo entra junto* con un solo escaneo." : ""} El código sirve *una sola vez* y solo para la fecha indicada. No lo compartas.`;
  return `https://wa.me/57${c.celular}?text=${encodeURIComponent(msg)}`;
}
