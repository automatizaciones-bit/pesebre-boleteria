"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Barra({ usuario, rol }: { usuario: string; rol: "admin" | "personal" }) {
  const ruta = usePathname();
  if (ruta.startsWith("/c/") || ruta === "/login" || ruta.startsWith("/comprar") || ruta === "/privacidad") return null;
  const salir = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  };
  const enlaces = [
    ["/taquilla", "🎟️ Taquilla"],
    ["/porteria", "📷 Portería"],
    ...(rol === "admin" ? [["/cortesias", "🎁 Cortesías"], ["/panel", "📊 Panel"]] : []),
  ];
  return (
    <header className="barra">
      <img src="/logo.png" alt="Pesebre Tenjo" />
      <nav>
        {enlaces.map(([href, txt]) => (
          <Link key={href} href={href} className={ruta.startsWith(href) ? "activo" : ""}>{txt}</Link>
        ))}
      </nav>
      <span className="usuario">👤 {usuario}{rol === "admin" ? " · admin" : ""}</span>
      <button className="btn sec chico" onClick={salir}>Salir</button>
    </header>
  );
}
