import Cortesias from "./Cortesias";
import { fechasVenta } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return <Cortesias fechas={fechasVenta()} />;
}
