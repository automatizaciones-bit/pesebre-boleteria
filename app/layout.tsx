import "./globals.css";
import type { Metadata, Viewport } from "next";
import Barra from "@/components/Barra";
import EstadoSistema from "@/components/EstadoSistema";
import { sesionActual } from "@/lib/db";

export const metadata: Metadata = {
  title: "Boletería · El Gran Pesebre de Tenjo 2026",
  icons: { icon: "/icon.png" },
};
export const viewport: Viewport = { themeColor: "#0a0f24", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  return (
    <html lang="es">
      <body>
        {sesion && <Barra usuario={sesion.nombre} rol={sesion.rol} prueba={sesion.prueba} />}
        {sesion && <EstadoSistema />}
        {children}
      </body>
    </html>
  );
}
