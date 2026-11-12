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

## Publicar una versión (actualización automática)

Los instaladores se publican en el repo **público** `Felipe2194/pos-comidas-releases` (solo el `.exe` y `latest.yml`; este repo de código sigue privado).

1. Subir `"version"` en `package.json` (ej. `1.3.0` → `1.3.1`) y commitear.
2. `npm run release` (usa la sesión de `gh`; arma el instalador, lo sube como Release y crea el tag).
3. `git push && git push --tags`.

Las PCs de los clientes, cuando tienen internet, buscan versiones al arrancar y cada 4 horas, la descargan en segundo plano
y **preguntan** antes de instalar ("Actualizar ahora" / "Más tarde"). Si eligen más tarde, queda un aviso en el menú.
Antes de instalar se guarda una copia `pos-<fecha>-antes-de-actualizar-v<versión>.sqlite` en la carpeta de backups.
Los datos (`%APPDATA%`) no se tocan al actualizar.

> Las PCs con versiones anteriores a la 1.3.0 no tienen el actualizador: hay que instalarles la 1.3.0 a mano una sola vez.

## Datos

- Base de datos: `%APPDATA%\pos-comidas\data\pos.sqlite`
- Copia automática diaria (últimas 30): `%APPDATA%\pos-comidas\backups\`
- Las ventas no se borran: se anulan, y sólo dentro de la caja abierta.

## Ticketera

Instalar el driver de Windows de la ticketera (Epson TM-T20, Xprinter, 3nStar, Gadnic, etc.), elegirla en Configuración → Ticketera y usar "Imprimir prueba". Si la ticketera corta el papel, el corte lo maneja el driver.
