import { db, conTokens, CompraDB, explicar } from "./db";
import { aleatorio } from "./firma";
import { fechasVenta, precios, TipoBoleta } from "./config";

export type Canal = "taquilla" | "cortesia" | "online";
export const METODOS_TAQUILLA = ["efectivo", "datafono", "transferencia", "qr"];
const TIPOS_DOC = ["CC", "NIT", "CE", "PAS"];

export type DatosCompra = {
  canal: Canal;
  taquilla: string;            // puesto que registra (o "En línea")
  cedula: string; nombre: string; celular: string; email: string;
  fecha_visita: string;
  adultos: number; ninos: number; menores: number;
  metodo_pago: string;
  referencia_pago: string;
  autorizado_por?: string; motivo: string;
  acepta_datos: boolean;
  requiere_factura: boolean;
  factura_datos: { tipo_doc: string; numero: string; razon_social: string; email: string } | null;
  sin_adulto_ok: boolean;
};

const ent = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const txt = (v: unknown, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Normaliza lo que llega del navegador (nunca se confía en totales ni precios del cliente). */
export function limpiar(b: Record<string, unknown>, canal: Canal, taquilla: string): DatosCompra {
  const f = (b.factura_datos ?? {}) as Record<string, unknown>;
  const requiereFactura = b.requiere_factura === true;
  return {
    canal, taquilla,
    cedula: String(b.cedula ?? "").replace(/\D/g, ""),
    nombre: txt(b.nombre, 80),
    celular: String(b.celular ?? "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, ""),
    email: txt(b.email, 120).toLowerCase(),
    fecha_visita: String(b.fecha_visita ?? ""),
    adultos: ent(b.adultos), ninos: ent(b.ninos), menores: ent(b.menores),
    metodo_pago: canal === "cortesia" ? "cortesia" : canal === "online" ? "online" : String(b.metodo_pago ?? ""),
    referencia_pago: txt(b.referencia_pago, 60),
    motivo: txt(b.motivo, 120),
    acepta_datos: b.acepta_datos === true,
    requiere_factura: requiereFactura,
    factura_datos: requiereFactura ? {
      tipo_doc: txt(f.tipo_doc, 5).toUpperCase(),
      numero: String(f.numero ?? "").replace(/[^0-9-]/g, "").slice(0, 20),
      razon_social: txt(f.razon_social, 120),
      email: txt(f.email, 120).toLowerCase(),
    } : null,
    sin_adulto_ok: b.sin_adulto_ok === true,
  };
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Devuelve un mensaje de error para el usuario, o null si todo está bien. */
export function validar(d: DatosCompra): { error: string; confirmar?: string } | null {
  if (d.cedula.length < 5 || d.cedula.length > 12) return { error: "Cédula inválida (5 a 12 dígitos)" };
  if (d.nombre.length < 3) return { error: "Escribe el nombre completo" };
  if (!/^3\d{9}$/.test(d.celular)) return { error: "Celular inválido (10 dígitos, empieza por 3)" };
  if (!fechasVenta().includes(d.fecha_visita)) return { error: "Fecha de visita no disponible" };
  const personas = d.adultos + d.ninos + d.menores;
  const max = d.canal === "online" ? 10 : 30;
  if (personas === 0) return { error: "Agrega al menos una persona" };
  if (personas > max) return { error: `Máximo ${max} boletas por compra` };
  if (!d.acepta_datos) return { error: "Falta la autorización de tratamiento de datos personales" };

  if (d.canal === "taquilla") {
    if (!METODOS_TAQUILLA.includes(d.metodo_pago)) return { error: "Método de pago inválido" };
    if (d.metodo_pago !== "efectivo" && d.referencia_pago.length < 3)
      return { error: "Escribe el número de aprobación / referencia del pago" };
  }
  if (d.canal === "cortesia" && d.motivo.length < 3) return { error: "Escribe el motivo o la entidad de la cortesía" };
  if (d.canal === "online" && !emailOk(d.email)) return { error: "Correo electrónico inválido" };
  if (d.email && !emailOk(d.email)) return { error: "Correo electrónico inválido" };

  if (d.requiere_factura && d.factura_datos) {
    const f = d.factura_datos;
    if (!TIPOS_DOC.includes(f.tipo_doc)) return { error: "Factura: tipo de documento inválido" };
    if (f.numero.length < 5) return { error: "Factura: número de documento / NIT inválido" };
    if (f.razon_social.length < 3) return { error: "Factura: escribe el nombre o razón social" };
    if (!emailOk(f.email)) return { error: "Factura: correo para enviar la factura inválido" };
  }
  if (d.adultos === 0 && !d.sin_adulto_ok && d.canal !== "cortesia")
    return { error: "La compra no tiene adultos. Confírmalo para continuar.", confirmar: "sin_adulto_ok" };
  return null;
}

/** Guarda la compra y sus boletas en una sola transacción. */
export async function guardarCompra(d: DatosCompra): Promise<{ compra?: Awaited<ReturnType<typeof conTokens>>; error?: string }> {
  const p = precios();
  const cortesia = d.canal === "cortesia";
  const precio = (t: TipoBoleta) => (cortesia ? 0 : p[t]);
  const total = d.adultos * precio("adulto") + d.ninos * precio("nino");

  const lista: { codigo: string; tipo: TipoBoleta; precio: number }[] = [];
  const agregar = (tipo: TipoBoleta, n: number) => {
    for (let i = 0; i < n; i++) lista.push({ codigo: aleatorio(10), tipo, precio: precio(tipo) });
  };
  agregar("adulto", d.adultos);
  agregar("nino", d.ninos);
  agregar("menor", d.menores);

  const fila = {
    token: aleatorio(16), cedula: d.cedula, nombre: d.nombre, celular: d.celular, email: d.email,
    fecha_visita: d.fecha_visita, adultos: d.adultos, ninos: d.ninos, menores: d.menores, total,
    metodo_pago: d.metodo_pago, taquilla: d.taquilla, canal: d.canal,
    estado_pago: d.canal === "online" ? "pendiente" : "pagado",
    referencia_pago: d.referencia_pago, autorizado_por: d.autorizado_por ?? null, motivo: d.motivo,
    acepta_datos: d.acepta_datos, requiere_factura: d.requiere_factura, factura_datos: d.factura_datos,
  };

  try {
    for (let intento = 0; intento < 2; intento++) {
      const { data: id, error } = await db().rpc("crear_venta", { p: fila, p_boletas: lista });
      if (!error) {
        const { data, error: e2 } = await db().from("compras").select("*, boletas(*)").eq("id", id).single();
        if (e2) return { error: explicar(e2) };
        return { compra: await conTokens(data as CompraDB) };
      }
      const m = /TOPE_CORTESIAS: quedan (\d+) de (\d+)/.exec(error.message);
      if (m) return { error: `Se alcanzó el tope de cortesías: quedan ${m[1]} de ${m[2]}. El administrador puede subir el tope en el Panel.` };
      if (error.code !== "23505") return { error: explicar(error) };
      lista.forEach((x) => (x.codigo = aleatorio(10)));   // código repetido (muy improbable): reintentar
      fila.token = aleatorio(16);
    }
    return { error: "No se pudo guardar, intenta de nuevo" };
  } catch (e) {
    return { error: explicar(e) };
  }
}
