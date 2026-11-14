import Taquilla from "./Taquilla";
import { fechasVenta, precios } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return <Taquilla precios={precios()} fechas={fechasVenta()} />;
}
