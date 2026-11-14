import "./globals.css";
import type { Metadata, Viewport } from "next";
import Barra from "@/components/Barra";
import EstadoSistema from "@/components/EstadoSistema";
import { usuarioActual } from "@/lib/db";

export const metadata: Metadata = {
  title: "Boletería · El Gran Pesebre de Tenjo 2026",
  icons: { icon: "/icon.png" },
};
export const viewport: Viewport = { themeColor: "#0a0f24", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  return (
    <html lang="es">
      <body>
        {usuario && <Barra usuario={usuario} />}
        {usuario && <EstadoSistema />}
        {children}
      </body>
    </html>
  );
}
