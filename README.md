# Boletería · El Gran Pesebre de Tenjo 2026

Sistema de venta e ingreso con QR de un solo uso.
Next.js (Vercel) + Supabase (Postgres).

| Pantalla | Para qué |
|---|---|
| `/taquilla` | Vender (cédula, nombre, celular, fecha, adultos / niños / menores), cobrar con cambio, imprimir en térmica y enviar por WhatsApp |
| `/porteria` | Escanear con lector USB o con la cámara. Verde = pasa, rojo = usada/falsa, naranja = otra fecha |
| `/panel` | Cierre de caja por taquilla y método, aforo del día, ingresos por puerta, buscar por cédula/celular para reimprimir, reenviar o anular |
| `/c/<token>` | Página **pública** que recibe el cliente por WhatsApp con sus QR |
| `/cortesias` | (admin) Cortesías una a una o en lote, con tope configurable |
| `/comprar` | Página **pública** de compra en línea (Wompi) |
| `/api/salud` | Chequeo público: dice si la configuración está bien, sin mostrar claves |

## Roles
- **Personal** (`ACCESS_PASSWORD`): vender, abrir/cerrar su caja, escanear, buscar y reimprimir.
- **Administrador** (`ADMIN_PASSWORD`): además panel, anulaciones (con motivo), cortesías, tope de cortesías y exportar a Excel.
- En "Puesto" se escribe el nombre del puesto (Taquilla 1, Puerta 2, Administración…). Queda registrado en cada venta, escaneo y arqueo.

## Caja (arqueo)
Cada taquilla abre caja con su base en efectivo antes de vender. Al cerrar, escribe el efectivo contado: el sistema calcula la diferencia contra base + ventas en efectivo e imprime el reporte de cierre para firmar.

## Venta en línea (Wompi)
1. Crear cuenta de comercio en Wompi y, en *Desarrolladores*, copiar: llave pública, secreto de integridad y secreto de eventos.
2. En Vercel: `VENTA_ONLINE=1`, `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` → Redeploy.
3. En Wompi → *URL de eventos*: `https://TU-DOMINIO/api/online/webhook`
4. Probar primero con las llaves de prueba (`pub_test_...`).
Las boletas en línea quedan "pendientes" y no sirven en la puerta hasta que Wompi confirma el pago (el sistema verifica firma y monto).

## Cómo funciona la seguridad
- Cada boleta tiene un código aleatorio + una **firma HMAC** (`QR_SECRET`). Un QR inventado o modificado se rechaza sin tocar la base de datos ("CÓDIGO FALSO").
- Al escanear, la base de datos marca la boleta como usada en **una sola operación atómica**: si dos puertas la escanean al mismo tiempo, sólo una pasa.
- La boleta sólo sirve **el día de visita** elegido.
- Las tablas tienen RLS activado sin políticas: sólo el servidor (service_role) lee/escribe.
- Todo el personal entra con la clave `ACCESS_PASSWORD` y el nombre del puesto (Taquilla 1, Puerta 2…). Ese nombre queda en cada venta y escaneo → cierre de caja por taquilla.

## Puesta en marcha (≈20 minutos)
1. **Supabase**: crear proyecto → *SQL Editor* → ejecutar en orden `supabase/schema.sql`, `supabase/migracion-002.sql` y `supabase/migracion-003.sql`.
2. Copiar de *Project Settings → API*: la URL y la `service_role key`.
3. **GitHub**: subir esta carpeta a un repositorio privado.
4. **Vercel**: *New Project* → importar el repo → en *Environment Variables* poner las de `.env.example`:
   - `QR_SECRET`: frase larga aleatoria. **No cambiarla durante el evento** (invalidaría todas las boletas).
   - `ACCESS_PASSWORD`: clave del personal.
   - `ADMIN_PASSWORD`: clave de administración (distinta).
   - `ORGANIZADOR_NOMBRE`, `ORGANIZADOR_NIT`, `ORGANIZADOR_CONTACTO`: aparecen en la política de datos (`/privacidad`, revisar con abogado).
   - `MODO_PRUEBA=1` para probar hoy; **`MODO_PRUEBA=0` antes del 4 de diciembre**.
5. Deploy. Entrar a `/login`.

Local: `cp .env.example .env.local`, llenar valores, `npm install`, `npm run dev`.

## Hardware
**Lector QR**: debe ser **2D** (los 1D/láser no leen QR en pantallas de celular). Ideal de presentación/manos libres.
- Se conecta por USB y "escribe" como teclado. Configurarlo con **sufijo Enter (CR)** (viene así casi siempre).
- El código es sólo letras y números (sin guiones) para que funcione aunque el teclado del PC esté en español.
- La página de portería mantiene el cursor en la caja de texto sola.

**Impresora térmica 80 mm** (ESC/POS, ej. Epson TM-T20):
- Instalar el driver, papel 80 mm, y en preferencias del driver activar **corte de papel por página** (así corta entre cada boleta).
- Para imprimir **sin el cuadro de diálogo**, abrir Chrome en la taquilla con:
  `chrome.exe --kiosk-printing --app=https://TU-DOMINIO/taquilla`
  y dejar la térmica como impresora predeterminada.

**Portería con celular**: botón "Usar cámara" (pide permiso de cámara; requiere HTTPS, Vercel ya lo da).

## QR por grupo
Cada compra genera **un solo QR** para todo el grupo (adultos, niños y menores). Al escanearlo entra el grupo completo; un segundo escaneo muestra "YA INGRESARON" con hora y puerta.

## Pagos por Nequi, Bancolombia, Daviplata u otro banco
La taquilla exige la referencia y permite tomar foto del comprobante. La venta queda **por verificar**: el administrador la revisa en el Panel contra la app del banco y la marca ✅ o ❌ (❌ anula la compra y su QR deja de servir).

## Envíos automáticos (opcionales)
- **Correo** (resend.com): `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`. Envía la entrada con el QR al cliente y el informe de cierre al cajero y al administrador.
- **Resumen de cierre por WhatsApp**: `ADMIN_WHATSAPP` (celular del administrador).
- **WhatsApp automático** (Meta Cloud API): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_LANG`.
  La plantilla se aprueba una sola vez: encabezado **imagen** (el QR) y cuerpo con 4 variables: {{1}} nombre, {{2}} fecha, {{3}} grupo, {{4}} enlace.
- `PUBLIC_URL`: dominio público (si se usa uno propio).

## Pendiente
- Factura electrónica automática vía proveedor tecnológico. Hoy se capturan los datos de quien la pide y salen en el Excel.
- Envío automático por WhatsApp (API oficial de Meta).
- Modo sin conexión en portería.
