"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Barra({ usuario }: { usuario: string }) {
  const ruta = usePathname();
  if (ruta.startsWith("/c/") || ruta === "/login") return null;
  const salir = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  };
  const enlaces = [
    ["/taquilla", "🎟️ Taquilla"],
    ["/porteria", "📷 Portería"],
    ["/panel", "📊 Panel"],
  ];
  return (
    <header className="barra">
      <img src="/logo.png" alt="Pesebre Tenjo" />
      <nav>
        {enlaces.map(([href, txt]) => (
          <Link key={href} href={href} className={ruta.startsWith(href) ? "activo" : ""}>{txt}</Link>
        ))}
      </nav>
      <span className="usuario">👤 {usuario}</span>
      <button className="btn sec chico" onClick={salir}>Salir</button>
    </header>
  );
}
