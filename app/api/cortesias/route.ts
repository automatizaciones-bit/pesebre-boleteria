import { json, sesionActual } from "@/lib/db";
import { limpiar, validar, guardarCompra } from "@/lib/ventas";
import { notificarCompra, origenPublico } from "@/lib/notificar";

// Cortesías (sólo administrador). Acepta una o varias (lote) en la misma llamada.
// Cada cortesía lleva titular con nombre y cédula; el tope se controla en la base de datos.
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere clave de administrador" }, 403);
  const b = await req.json().catch(() => ({}));
  const lista: Record<string, unknown>[] = Array.isArray(b.lote) ? b.lote.slice(0, 200) : [b];
  if (lista.length === 0) return json({ error: "No hay cortesías para crear" }, 400);

  const resultados: { fila: number; nombre: string; compra?: unknown; error?: string }[] = [];
  for (let i = 0; i < lista.length; i++) {
    const fila = { ...lista[i], fecha_visita: lista[i].fecha_visita ?? b.fecha_visita, motivo: lista[i].motivo ?? b.motivo, acepta_datos: b.acepta_datos ?? lista[i].acepta_datos };
    const d = limpiar(fila, "cortesia", s.nombre);
    d.autorizado_por = s.nombre;
    const v = validar(d);
    if (v) { resultados.push({ fila: i + 1, nombre: d.nombre, error: v.error }); continue; }
    const r = await guardarCompra(d);
    resultados.push({ fila: i + 1, nombre: d.nombre, ...(r.error ? { error: r.error } : { compra: r.compra }) });
    if (r.error?.startsWith("Se alcanzó el tope")) {          // no seguir intentando el resto
      for (let j = i + 1; j < lista.length; j++) resultados.push({ fila: j + 1, nombre: String(lista[j].nombre ?? ""), error: "No creada: tope alcanzado" });
      break;
    }
  }
  // Envío automático (correo / WhatsApp) para lotes pequeños; en lotes grandes se usa "Reenviar".
  const creadas = resultados.filter((r) => r.compra) as { compra: { id: number } }[];
  if (creadas.length <= 25) {
    const origen = origenPublico(req);
    for (const r of creadas) Object.assign(r, { envio: await notificarCompra(r.compra.id, origen) });
  }
  return json({ resultados, creadas: creadas.length });
}
