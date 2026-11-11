// Impresión en ticketera térmica (58/80mm) usando el driver de Windows.
// Funciona con cualquier ticketera instalada como impresora (Epson, Xprinter, 3nStar, Gadnic, etc.).
const { BrowserWindow } = require('electron');

const money = (n) =>
  '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const ORDER_TYPES = { mostrador: 'MOSTRADOR', llevar: 'PARA LLEVAR', delivery: 'DELIVERY', mesa: 'MESA' };

function baseCss(widthMm) {
  // Ancho imprimible típico: 80mm -> ~72mm, 58mm -> ~48mm
  const printable = widthMm >= 80 ? 72 : 48;
  const fs = widthMm >= 80 ? 12 : 10;
  return `
    @page { margin: 0; size: ${widthMm}mm auto; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${printable}mm; margin: 0 auto; padding: 2mm 0 6mm; font-family: 'Courier New', monospace; font-size: ${fs}px; line-height: 1.25; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .big { font-size: ${fs + 6}px; font-weight: bold; } .xl { font-size: ${fs + 14}px; font-weight: bold; }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    .note { font-style: italic; padding-left: 8px; }
    .inv { background: #000; color: #fff; padding: 2px 4px; display: inline-block; }
  `;
}
const wrap = (widthMm, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(widthMm)}</style></head><body>${body}</body></html>`;

function payLabel(settings, id) {
  return (settings.payment_methods || []).find((m) => m.id === id)?.label || id;
}

function ticketHtml(sale, settings) {
  const w = Number(settings.paper_width) || 80;
  const rows = sale.items.map((i) => `
    <tr><td>${i.qty} x ${esc(i.name)}</td><td class="r">${money(i.qty * i.price)}</td></tr>
    ${i.notes ? `<tr><td colspan="2" class="note">* ${esc(i.notes)}</td></tr>` : ''}`).join('');
  const pays = sale.payments.map((p) => `<tr><td>${esc(payLabel(settings, p.method))}</td><td class="r">${money(p.amount)}</td></tr>`).join('');
  return wrap(w, `
    <div class="c big">${esc(settings.business_name)}</div>
    ${settings.business_address ? `<div class="c">${esc(settings.business_address)}</div>` : ''}
    ${settings.business_phone ? `<div class="c">Tel: ${esc(settings.business_phone)}</div>` : ''}
    <hr>
    <div class="c xl">PEDIDO #${sale.number}</div>
    <div class="c">${ORDER_TYPES[sale.order_type] || ''}${sale.customer ? ' - ' + esc(sale.customer) : ''}</div>
    <div class="c">${fmtDate(sale.created_at)}</div>
    ${sale.status === 'anulada' ? '<div class="c big inv">ANULADA</div>' : ''}
    <hr>
    <table>${rows}</table>
    <hr>
    <table>
      ${sale.discount > 0 ? `<tr><td>Subtotal</td><td class="r">${money(sale.subtotal)}</td></tr><tr><td>Descuento</td><td class="r">-${money(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td>TOTAL</td><td class="r">${money(sale.total)}</td></tr>
    </table>
    <hr>
    <table>${pays}
      ${sale.cash_received ? `<tr><td>Recibido</td><td class="r">${money(sale.cash_received)}</td></tr><tr><td>Vuelto</td><td class="r">${money(sale.change_given)}</td></tr>` : ''}
    </table>
    ${sale.notes ? `<hr><div>Obs: ${esc(sale.notes)}</div>` : ''}
    <hr>
    <div class="c">${esc(settings.ticket_footer)}</div>
    <div class="c" style="font-size:9px">Comprobante no válido como factura</div>
  `);
}

function comandaHtml(sale, settings) {
  const w = Number(settings.paper_width) || 80;
  const rows = sale.items.map((i) => `
    <div class="big">${i.qty} x ${esc(i.name)}</div>
    ${i.notes ? `<div class="note big">→ ${esc(i.notes)}</div>` : ''}`).join('');
  return wrap(w, `
    <div class="c b">COMANDA COCINA</div>
    <div class="c xl">#${sale.number}</div>
    <div class="c big">${ORDER_TYPES[sale.order_type] || ''}</div>
    ${sale.customer ? `<div class="c big">${esc(sale.customer)}</div>` : ''}
    <div class="c">${fmtDate(sale.created_at)}</div>
    <hr>
    ${rows}
    ${sale.notes ? `<hr><div class="big">OBS: ${esc(sale.notes)}</div>` : ''}
    <hr>
    <div class="c">${sale.items.reduce((a, i) => a + i.qty, 0)} ítem(s)</div>
  `);
}

function closeHtml(sum, settings) {
  const w = Number(settings.paper_width) || 80;
  const s = sum.session;
  const methods = sum.byMethod.map((m) => `<tr><td>${esc(m.label)} (${m.n})</td><td class="r">${money(m.total)}</td></tr>
      ${m.pendiente > 0 ? `<tr><td class="note">pend. verificar</td><td class="r">${money(m.pendiente)}</td></tr>` : ''}
      ${m.rechazado > 0 ? `<tr><td class="note">rechazado</td><td class="r">${money(m.rechazado)}</td></tr>` : ''}`).join('');
  const movs = sum.movements.map((m) => `<tr><td>${m.type === 'ingreso' ? '+' : '-'} ${esc(m.reason)}</td><td class="r">${money(m.amount)}</td></tr>`).join('');
  const prods = sum.topProducts.map((p) => `<tr><td>${p.qty} x ${esc(p.name)}</td><td class="r">${money(p.total)}</td></tr>`).join('');
  return wrap(w, `
    <div class="c big">${esc(settings.business_name)}</div>
    <div class="c b">${s.status === 'cerrada' ? 'CIERRE DE CAJA' : 'ESTADO DE CAJA (PARCIAL)'} #${s.id}</div>
    <hr>
    <div>Apertura: ${fmtDate(s.opened_at)} ${esc(s.opened_by || '')}</div>
    ${s.closed_at ? `<div>Cierre: ${fmtDate(s.closed_at)} ${esc(s.closed_by || '')}</div>` : ''}
    <hr>
    <table>
      <tr><td>Ventas (${sum.totals.n})</td><td class="r b">${money(sum.totals.total)}</td></tr>
      ${sum.totals.discount > 0 ? `<tr><td>Descuentos</td><td class="r">${money(sum.totals.discount)}</td></tr>` : ''}
      ${sum.voided.n > 0 ? `<tr><td>Anuladas (${sum.voided.n})</td><td class="r">${money(sum.voided.total)}</td></tr>` : ''}
    </table>
    <hr><div class="b">POR MEDIO DE PAGO</div>
    <table>${methods || '<tr><td>Sin ventas</td></tr>'}</table>
    <hr><div class="b">EFECTIVO</div>
    <table>
      <tr><td>Fondo inicial</td><td class="r">${money(s.opening_amount)}</td></tr>
      <tr><td>Ventas efectivo</td><td class="r">${money(sum.cashSales)}</td></tr>
      ${movs}
      <tr class="b"><td>Esperado en caja</td><td class="r">${money(sum.expectedCash)}</td></tr>
      ${s.status === 'cerrada' ? `<tr><td>Contado</td><td class="r">${money(s.counted_cash)}</td></tr>
      <tr class="b"><td>Diferencia</td><td class="r">${money(s.difference)}</td></tr>` : ''}
    </table>
    ${prods ? `<hr><div class="b">PRODUCTOS VENDIDOS</div><table>${prods}</table>` : ''}
    ${s.notes ? `<hr><div>Obs: ${esc(s.notes)}</div>` : ''}
    <hr><div class="c">Impreso ${fmtDate(new Date().toISOString())}</div>
  `);
}

async function printHtml(html, settings, { preview = false } = {}) {
  const w = Number(settings.paper_width) || 80;
  const win = new BrowserWindow({
    show: preview,
    width: Math.round((w / 25.4) * 96) + 40,
    height: 800,
    title: 'Vista previa de impresión',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  if (preview) return { ok: true, preview: true };

  // Alto del contenido en micrones para que el papel de rollo no corte de más
  const heightPx = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  const heightMicrons = Math.max(Math.ceil((heightPx / 96) * 25400) + 5000, 50000);

  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: settings.printer_name || undefined,
        margins: { marginType: 'none' },
        pageSize: { width: w * 1000, height: heightMicrons },
      },
      (success, failureReason) => {
        win.destroy();
        resolve(success ? { ok: true } : { ok: false, error: failureReason || 'Error de impresión' });
      }
    );
  });
}

async function printSale(sale, settings, { ticket = true, comanda = true, preview = false } = {}) {
  const results = [];
  if (ticket) results.push(await printHtml(ticketHtml(sale, settings), settings, { preview }));
  if (comanda) {
    const copies = Math.max(1, Number(settings.comanda_copies) || 1);
    for (let i = 0; i < copies; i++) results.push(await printHtml(comandaHtml(sale, settings), settings, { preview }));
  }
  const failed = results.find((r) => !r.ok);
  return failed || { ok: true };
}

async function printClose(summary, settings, opts = {}) {
  return printHtml(closeHtml(summary, settings), settings, opts);
}

async function printTest(settings, opts = {}) {
  const w = Number(settings.paper_width) || 80;
  return printHtml(wrap(w, `<div class="c big">${esc(settings.business_name)}</div><hr><div class="c">Prueba de impresión OK</div><div class="c">Papel ${w}mm</div><div class="c">${fmtDate(new Date().toISOString())}</div>`), settings, opts);
}

module.exports = { printSale, printClose, printTest };
