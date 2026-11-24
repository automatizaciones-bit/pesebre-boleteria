export const metadata = { title: "Política de tratamiento de datos · El Gran Pesebre de Tenjo 2026" };

// PLANTILLA: debe revisarla el abogado del organizador antes del evento.
// Los datos del responsable se configuran en Vercel: ORGANIZADOR_NOMBRE, ORGANIZADOR_NIT, ORGANIZADOR_CONTACTO.
export default function Privacidad() {
  const org = process.env.ORGANIZADOR_NOMBRE ?? "[Nombre del organizador]";
  const nit = process.env.ORGANIZADOR_NIT ?? "[NIT]";
  const contacto = process.env.ORGANIZADOR_CONTACTO ?? "[correo o teléfono de contacto]";
  return (
    <main className="publica" style={{ textAlign: "left", maxWidth: 720 }}>
      <div style={{ textAlign: "center" }}><img src="/logo.png" alt="" style={{ width: 160 }} /></div>
      <h1>Tratamiento de datos personales</h1>
      <p><b>Responsable:</b> {org}, NIT {nit}. Contacto: {contacto}.</p>
      <p><b>Datos que recogemos:</b> nombre, número de cédula, celular y, en compras en línea o con factura, correo electrónico y datos de facturación.</p>
      <p><b>Para qué:</b> emitir y controlar las boletas de ingreso a El Gran Pesebre de Tenjo 2026, evitar la reventa y el fraude, enviar las boletas por WhatsApp o correo, atender reclamos y cumplir obligaciones contables y tributarias.</p>
      <p><b>Tus derechos:</b> conocer, actualizar, rectificar y suprimir tus datos, y revocar la autorización, escribiendo a {contacto}. (Ley 1581 de 2012 y Decreto 1377 de 2013.)</p>
      <p><b>Conservación:</b> los datos se guardan durante el evento y el tiempo que exijan las normas contables.</p>
      <p className="suave" style={{ fontSize: ".85rem" }}>Al marcar la casilla de autorización en la taquilla o en la compra en línea, aceptas este tratamiento.</p>
    </main>
  );
}
