# POS Comidas

Sistema de punto de venta de escritorio (Windows) para venta de comidas. Funciona **100% offline**: todo se guarda en una base SQLite local.

## Funciones

- **Vender (F1)**: grilla de productos por categoría, buscador (F8), notas por ítem para cocina ("sin sal"), observaciones, tipo de pedido (mostrador / para llevar / delivery / mesa), descuento, ítem libre. Cobrar con F9.
- **Cobro**: efectivo (con cálculo de vuelto), transferencia, Mercado Pago QR, débito, crédito, o **pago mixto** dividido entre varios medios. Los medios se configuran.
- **Impresión en ticketera**: al confirmar la venta se imprime automáticamente el **ticket del cliente** y la **comanda de cocina** (letra grande, sin precios, con notas). Papel de 58 u 80 mm. Sin impresora configurada muestra vista previa.
- **Caja (F2)**: apertura con fondo inicial, ingresos/egresos de efectivo, cierre con arqueo (esperado vs. contado → faltante/sobrante), impresión del cierre, historial de cajas.
- **Verificar pagos (F3)**: lista de transferencias/QR/tarjetas pendientes. Se marca cada una como "Llegó" o "No llegó" (con motivo). Un contador en el menú muestra cuántas quedan pendientes.
- **Ventas (F4)**: historial por fecha, detalle, reimpresión, anulación (con motivo y PIN), más vendidos, exportación a Excel (CSV).
- **Productos (F5)** y **Configuración (F6)**: precios, categorías, ocultar productos sin stock, datos del ticket, impresora, PIN de administrador, copias de seguridad.

## Desarrollo

```bash
npm install
npm run dev      # Vite + Electron con recarga en caliente
npm start        # build + abrir la app
npm run dist     # genera el instalador .exe en /release
```

Requiere Node 22+. `better-sqlite3` usa un binario precompilado para Electron (no hace falta Visual Studio).

## Datos

- Base de datos: `%APPDATA%\pos-comidas\data\pos.sqlite`
- Copia automática diaria (últimas 30): `%APPDATA%\pos-comidas\backups\`
- Las ventas no se borran: se anulan, y sólo dentro de la caja abierta.

## Ticketera

Instalar el driver de Windows de la ticketera (Epson TM-T20, Xprinter, 3nStar, Gadnic, etc.), elegirla en Configuración → Ticketera y usar "Imprimir prueba". Si la ticketera corta el papel, el corte lo maneja el driver.
