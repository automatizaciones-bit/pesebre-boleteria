import QRCode from "qrcode";

/** QR como SVG, generado de forma síncrona (nítido en impresora térmica y listo al instante). */
export default function Qr({ texto }: { texto: string }) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const m = 2; // margen (zona silenciosa)
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
    }
  }
  const t = n + m * 2;
  return (
    <svg viewBox={`0 0 ${t} ${t}`} shapeRendering="crispEdges" role="img" aria-label="Código QR">
      <rect width={t} height={t} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
