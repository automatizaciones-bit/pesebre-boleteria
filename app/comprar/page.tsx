import Comprar from "./Comprar";
import { fechasVenta, precios } from "@/lib/config";
import { wompi } from "@/lib/wompi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compra tus boletas · El Gran Pesebre de Tenjo 2026" };

export default function Pagina() {
  return <Comprar activo={wompi().activo} precios={precios()} fechas={fechasVenta()} />;
}
