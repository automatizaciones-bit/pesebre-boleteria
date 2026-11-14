import { db, json, usuarioActual, conTokens, CompraDB, explicar } from "@/lib/db";
import { aleatorio } from "@/lib/firma";
import { fechasVenta, precios, TipoBoleta } from "@/lib/config";

const METODOS = ["efectivo", "datafono", "transferencia", "qr"];
const MAX_POR_COMPRA = 30;

export async function POST(req: Request) {
  const taquilla = await usuarioActual();
  if (!taquilla) return json({ error: "Sesión vencida" }, 401);

  const b = await req.json().catch(() => ({}));
  const cedula = String(b.cedula ?? "").replace(/\D/g, "");
  const nombre = String(b.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const celular = String(b.celular ?? "").replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  const fecha = String(b.fecha_visita ?? "");
  const adultos = Math.max(0, Math.floor(Number(b.adultos) || 0));
  const ninos = Math.max(0, Math.floor(Number(b.ninos) || 0));
  const menores = Math.max(0, Math.floor(Number(b.menores) || 0));
  const metodo = String(b.metodo_pago ?? "");

  // ---- Validaciones (el servidor nunca confía en el total que manda el navegador) ----
  if (cedula.length < 5 || cedula.length > 12) return json({ error: "Cédula inválida" }, 400);
  if (nombre.length < 3) return json({ error: "Escribe el nombre completo" }, 400);
  if (!/^3\d{9}$/.test(celular)) return json({ error: "Celular inválido (10 dígitos, empieza por 3)" }, 400);
  if (!fechasVenta().includes(fecha)) return json({ error: "Fecha de visita no disponible" }, 400);
  if (!METODOS.includes(metodo)) return json({ error: "Método de pago inválido" }, 400);
  const personas = adultos + ninos + menores;
  if (personas === 0) return json({ error: "Agrega al menos una persona" }, 400);
  if (personas > MAX_POR_COMPRA) return json({ error: `Máximo ${MAX_POR_COMPRA} boletas por compra` }, 400);
  if (adultos === 0 && b.sin_adulto_ok !== true) {
    // se permite, pero el cajero debe confirmarlo en pantalla
    return json({ error: "La compra no tiene adultos. Confírmalo para continuar.", confirmar: "sin_adulto_ok" }, 409);
  }

  const p = precios();
  const total = adultos * p.adulto + ninos * p.nino;

  const lista: { codigo: string; tipo: TipoBoleta; precio: number }[] = [];
  const agregar = (tipo: TipoBoleta, n: number) => {
    for (let i = 0; i < n; i++) lista.push({ codigo: aleatorio(10), tipo, precio: p[tipo] });
  };
  agregar("adulto", adultos);
  agregar("nino", ninos);
  agregar("menor", menores);

  const compra = {
    token: aleatorio(16), cedula, nombre, celular, fecha_visita: fecha,
    adultos, ninos, menores, total, metodo_pago: metodo, taquilla,
  };

  // Un reintento por si (muy improbable) se repite un código aleatorio
  try {
  for (let intento = 0; intento < 2; intento++) {
    const { data: id, error } = await db().rpc("crear_venta", { p: compra, p_boletas: lista });
    if (!error) {
      const { data } = await db().from("compras").select("*, boletas(*)").eq("id", id).single();
      return json({ compra: await conTokens(data as CompraDB) });
    }
    if (error.code !== "23505") return json({ error: "Error guardando la venta: " + explicar(error) }, 500);
    lista.forEach((x) => (x.codigo = aleatorio(10)));
    compra.token = aleatorio(16);
  }
  } catch (e) {
    return json({ error: "Error guardando la venta: " + explicar(e) }, 500);
  }
  return json({ error: "No se pudo guardar la venta, intenta de nuevo" }, 500);
}
