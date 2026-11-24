import { db, sesionActual, explicar } from "@/lib/db";
import { hoyBogota } from "@/lib/config";

// Exporta compras a CSV (abre directo en Excel). ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (fecha de venta)
export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return new Response("Requiere clave de administrador", { status: 403 });
  const u = new URL(req.url).searchParams;
  const desde = u.get("desde") ?? hoyBogota();
  const hasta = u.get("hasta") ?? desde;
  if (![desde, hasta].every((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))) return new Response("Fechas inválidas", { status: 400 });

  // Límites del día en hora de Colombia (UTC-5)
  const ini = new Date(desde + "T00:00:00-05:00").toISOString();
  const fin = new Date(new Date(hasta + "T00:00:00-05:00").getTime() + 86400000).toISOString();

  const filas: Record<string, unknown>[] = [];
  try {
    for (let i = 0; ; i += 1000) {
      const { data, error } = await db().from("compras").select("*")
        .gte("created_at", ini).lt("created_at", fin).order("id").range(i, i + 999);
      if (error) return new Response(explicar(error), { status: 500 });
      filas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  } catch (e) { return new Response(explicar(e), { status: 500 }); }

  const cols: [string, (r: Record<string, any>) => unknown][] = [
    ["Compra", (r) => r.id],
    ["Fecha venta", (r) => new Date(r.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })],
    ["Canal", (r) => r.canal],
    ["Puesto", (r) => r.taquilla],
    ["Método", (r) => r.metodo_pago],
    ["Referencia pago", (r) => r.referencia_pago],
    ["Estado pago", (r) => r.estado_pago],
    ["Titular", (r) => r.nombre],
    ["Cédula", (r) => r.cedula],
    ["Celular", (r) => r.celular],
    ["Correo", (r) => r.email],
    ["Fecha visita", (r) => r.fecha_visita],
    ["Adultos", (r) => r.adultos],
    ["Niños 6-14", (r) => r.ninos],
    ["Menores de 6", (r) => r.menores],
    ["Total", (r) => r.total],
    ["Cortesía autorizada por", (r) => r.autorizado_por],
    ["Motivo cortesía", (r) => r.motivo],
    ["Anulada", (r) => (r.anulada ? "SÍ" : "")],
    ["Anulada por", (r) => r.anulada_por],
    ["Motivo anulación", (r) => r.anulada_motivo],
    ["Requiere factura", (r) => (r.requiere_factura ? "SÍ" : "")],
    ["Factura tipo doc", (r) => r.factura_datos?.tipo_doc],
    ["Factura número", (r) => r.factura_datos?.numero],
    ["Factura razón social", (r) => r.factura_datos?.razon_social],
    ["Factura correo", (r) => r.factura_datos?.email],
  ];
  const celda = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    // Evita que Excel ejecute fórmulas inyectadas (=, +, -, @)
    const seguro = /^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? "'" + t : t;
    return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  const csv = "﻿" + [cols.map((c) => c[0]).join(";"), ...filas.map((r) => cols.map((c) => celda(c[1](r))).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pesebre-ventas-${desde}${hasta !== desde ? "_a_" + hasta : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
