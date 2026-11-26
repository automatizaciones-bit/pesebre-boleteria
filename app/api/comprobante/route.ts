import { db, json, sesionActual, explicar } from "@/lib/db";
import { aleatorio } from "@/lib/firma";
import { hoyBogota } from "@/lib/config";

const BUCKET = "comprobantes";
const MAX = 4 * 1024 * 1024;

// POST (personal): sube la foto del comprobante de una venta (Nequi, Bancolombia, etc.)
export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const form = await req.formData().catch(() => null);
  const id = Number(form?.get("compra_id"));
  const foto = form?.get("foto");
  if (!id || !(foto instanceof Blob)) return json({ error: "Falta la compra o la foto" }, 400);
  if (foto.size > MAX) return json({ error: "La foto es muy pesada (máx. 4 MB)" }, 400);
  if (!/^image\/(jpeg|png|webp)$/.test(foto.type)) return json({ error: "Formato no permitido (usa JPG o PNG)" }, 400);
  try {
    const { data: c } = await db().from("compras").select("id, taquilla").eq("id", id).maybeSingle();
    if (!c) return json({ error: "La compra no existe" }, 404);
    if (s.rol !== "admin" && c.taquilla !== s.nombre) return json({ error: "Esa compra es de otra taquilla" }, 403);
    const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
    const ruta = `${hoyBogota()}/${id}-${aleatorio(8)}.${ext}`;
    const { error } = await db().storage.from(BUCKET).upload(ruta, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type, upsert: false });
    if (error) return json({ error: "No se pudo guardar la foto: " + explicar(error) }, 500);
    const { error: e2 } = await db().from("compras").update({ comprobante_path: ruta }).eq("id", id);
    if (e2) return json({ error: explicar(e2) }, 500);
    return json({ ok: true });
  } catch (e) { return json({ error: explicar(e) }, 500); }
}

// GET ?id= (admin): abre la foto con un enlace temporal de 5 minutos
export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s || s.rol !== "admin") return new Response("Requiere clave de administrador", { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  try {
    const { data: c } = await db().from("compras").select("comprobante_path").eq("id", id).maybeSingle();
    if (!c?.comprobante_path) return new Response("Esta venta no tiene foto del comprobante", { status: 404 });
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(c.comprobante_path, 300);
    if (error || !data) return new Response("No se pudo abrir la foto: " + explicar(error), { status: 500 });
    return Response.redirect(data.signedUrl, 302);
  } catch (e) { return new Response(explicar(e), { status: 500 }); }
}
