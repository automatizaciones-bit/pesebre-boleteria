export const EVENTO_NOMBRE = "El Gran Pesebre de Tenjo 2026";

export type TipoBoleta = "adulto" | "nino" | "menor";

export const NOMBRE_TIPO: Record<TipoBoleta, string> = {
  adulto: "Adulto",
  nino: "Niño (6 a 14 años)",
  menor: "Menor de 6 años",
};

export function precios() {
  return {
    adulto: Number(process.env.PRECIO_ADULTO ?? 40000),
    nino: Number(process.env.PRECIO_NINO ?? 20000),
    menor: 0,
  };
}

/** Fecha de hoy en Colombia, formato YYYY-MM-DD */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Fechas que se pueden vender: desde hoy hasta el fin del evento. */
export function fechasVenta(): string[] {
  const inicio = process.env.EVENTO_INICIO ?? "2026-12-04";
  const fin = process.env.EVENTO_FIN ?? "2027-01-03";
  const hoy = hoyBogota();
  const out: string[] = [];
  if (process.env.MODO_PRUEBA === "1" && (hoy < inicio || hoy > fin)) out.push(hoy);
  const d = new Date(inicio + "T12:00:00Z");
  const f = new Date(fin + "T12:00:00Z");
  while (d <= f) {
    const s = d.toISOString().slice(0, 10);
    if (s >= hoy) out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function fechaLarga(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const s = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function pesos(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO").format(n);
}
