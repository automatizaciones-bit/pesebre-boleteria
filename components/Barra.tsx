"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Barra({ usuario, rol, prueba }: { usuario: string; rol: "admin" | "personal" | "portero"; prueba?: boolean }) {
  const ruta = usePathname();
  if (ruta.startsWith("/c/") || ruta === "/login" || ruta.startsWith("/comprar") || ruta === "/privacidad") return null;
  const salir = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  };
  const enlaces = rol === "portero" ? [["/porteria", "📷 Portería"]] : [
    ["/taquilla", "🎟️ Taquilla"],
    ["/porteria", "📷 Portería"],
    ...(rol === "admin" ? [["/cortesias", "🎁 Cortesías"], ["/panel", "📊 Panel"]] : []),
  ];
  return (
    <>
    {prueba && <div className="franja-capacitacion">🧪 MODO CAPACITACIÓN · todo funciona igual, pero estos datos NO son reales y no se mezclan con las ventas del evento</div>}
    <header className="barra">
      <img src="/logo.png" alt="Pesebre Tenjo" />
      <nav>
        {enlaces.map(([href, txt]) => (
          <Link key={href} href={href} className={ruta.startsWith(href) ? "activo" : ""}>{txt}</Link>
        ))}
      </nav>
      <span className="usuario">👤 {usuario}{rol === "admin" ? " · admin" : rol === "portero" ? " · portería" : ""}</span>
      <button className="btn sec chico" onClick={salir}>Salir</button>
    </header>
    </>
  );
}
