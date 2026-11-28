import { db, json, sesionActual, explicar } from "@/lib/db";
import { claveAleatoria, hashClave, limpiarNombre, validarClave, RolUsuario } from "@/lib/usuarios";

export const dynamic = "force-dynamic";
const ROLES: RolUsuario[] = ["vendedor", "portero", "admin"];
const CAMPOS = "id, nombre, rol, prueba, activo, celular, creado_por, created_at, ultimo_ingreso";

// Sólo administrador (middleware).
export async function GET() {
  const { data, error } = await db().from("usuarios").select(CAMPOS).order("prueba").order("nombre");
  if (error) return json({ error: explicar(error) }, 500);
  return json({ usuarios: data });
}

// POST { accion: "crear", nombre, clave, rol, prueba, celular }
//      { accion: "clave", id, clave }            → cambia la clave
//      { accion: "activo", id, activo }          → activa / desactiva
//      { accion: "capacitacion", cantidad }      → crea "Capacitación 1..N" con claves aleatorias (se muestran una sola vez)
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return json({ error: "Requiere administrador" }, 403);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.accion === "crear") {
      const nombre = limpiarNombre(b.nombre);
      const clave = String(b.clave ?? "");
      const rol = ROLES.includes(b.rol) ? (b.rol as RolUsuario) : "vendedor";
      if (nombre.length < 3) return json({ error: "Escribe el nombre del usuario (mínimo 3 letras)" }, 400);
      if (/^(taquilla|puerta|administraci)/i.test(nombre)) return json({ error: "Usa el nombre de la persona, no el del puesto" }, 400);
      const e = validarClave(clave);
      if (e) return json({ error: e }, 400);
      const celular = String(b.celular ?? "").replace(/\D/g, "").slice(-10) || null;
      const { error } = await db().from("usuarios").insert({
        nombre, clave_hash: await hashClave(clave), rol, prueba: b.prueba === true, celular, creado_por: s.nombre,
      });
      if (error) return json({ error: error.code === "23505" ? "Ya existe un usuario con ese nombre" : explicar(error) }, 400);
      return json({ ok: true });
    }
    if (b.accion === "clave") {
      const clave = String(b.clave ?? "");
      const e = validarClave(clave);
      if (e) return json({ error: e }, 400);
      const { error } = await db().from("usuarios").update({ clave_hash: await hashClave(clave) }).eq("id", Number(b.id));
      if (error) return json({ error: explicar(error) }, 500);
      return json({ ok: true });
    }
    if (b.accion === "activo") {
      const { error } = await db().from("usuarios").update({ activo: b.activo === true }).eq("id", Number(b.id));
      if (error) return json({ error: explicar(error) }, 500);
      return json({ ok: true });
    }
    if (b.accion === "capacitacion") {
      const cantidad = Math.min(Math.max(Number(b.cantidad) || 5, 1), 10);
      const { data: existentes } = await db().from("usuarios").select("nombre").ilike("nombre", "Capacitación %");
      const usados = new Set((existentes ?? []).map((u) => u.nombre.toLowerCase()));
      const creados: { nombre: string; clave: string }[] = [];
      for (let i = 1; creados.length < cantidad && i <= 50; i++) {
        const nombre = `Capacitación ${i}`;
        if (usados.has(nombre.toLowerCase())) continue;
        const clave = claveAleatoria();
        const { error } = await db().from("usuarios").insert({ nombre, clave_hash: await hashClave(clave), rol: "vendedor", prueba: true, creado_por: s.nombre });
        if (!error) creados.push({ nombre, clave });
      }
      return json({ ok: true, creados });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) { return json({ error: explicar(e) }, 500); }
}
