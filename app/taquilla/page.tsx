import Taquilla from "./Taquilla";
import { fechasVenta, precios } from "@/lib/config";
import { usuarioActual } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  return <Taquilla precios={precios()} fechas={fechasVenta()} puesto={(await usuarioActual()) ?? ""} />;
}
