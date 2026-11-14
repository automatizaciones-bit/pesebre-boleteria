# Boletería · El Gran Pesebre de Tenjo 2026

Sistema de venta e ingreso con QR de un solo uso.
Next.js (Vercel) + Supabase (Postgres).

| Pantalla | Para qué |
|---|---|
| `/taquilla` | Vender (cédula, nombre, celular, fecha, adultos / niños / menores), cobrar con cambio, imprimir en térmica y enviar por WhatsApp |
| `/porteria` | Escanear con lector USB o con la cámara. Verde = pasa, rojo = usada/falsa, naranja = otra fecha |
| `/panel` | Cierre de caja por taquilla y método, aforo del día, ingresos por puerta, buscar por cédula/celular para reimprimir, reenviar o anular |
| `/c/<token>` | Página **pública** que recibe el cliente por WhatsApp con sus QR |

## Cómo funciona la seguridad
- Cada boleta tiene un código aleatorio + una **firma HMAC** (`QR_SECRET`). Un QR inventado o modificado se rechaza sin tocar la base de datos ("CÓDIGO FALSO").
- Al escanear, la base de datos marca la boleta como usada en **una sola operación atómica**: si dos puertas la escanean al mismo tiempo, sólo una pasa.
- La boleta sólo sirve **el día de visita** elegido.
- Las tablas tienen RLS activado sin políticas: sólo el servidor (service_role) lee/escribe.
- Todo el personal entra con la clave `ACCESS_PASSWORD` y el nombre del puesto (Taquilla 1, Puerta 2…). Ese nombre queda en cada venta y escaneo → cierre de caja por taquilla.

## Puesta en marcha (≈20 minutos)
1. **Supabase**: crear proyecto (región São Paulo, la más cercana) → *SQL Editor* → pegar y ejecutar `supabase/schema.sql`.
2. Copiar de *Project Settings → API*: la URL y la `service_role key`.
3. **GitHub**: subir esta carpeta a un repositorio privado.
4. **Vercel**: *New Project* → importar el repo → en *Environment Variables* poner las de `.env.example`:
   - `QR_SECRET`: frase larga aleatoria. **No cambiarla durante el evento** (invalidaría todas las boletas).
   - `ACCESS_PASSWORD`: clave del personal.
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

## Pendiente (Fase 2)
- Factura electrónica vía proveedor tecnológico (columnas `factura_numero` / `factura_estado` ya creadas).
- Venta en línea con pasarela de pagos.
- Envío automático por WhatsApp (API oficial de Meta).
- Modo sin conexión en portería.
