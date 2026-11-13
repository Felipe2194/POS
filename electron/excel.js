// Exportación de ventas a Excel (.xlsx) con formato: tabla con filtros, columnas con ancho,
// fechas reales (dd/mm/aaaa), importes en $ y una hoja de resumen por medio de pago y producto.
const ExcelJS = require('exceljs');

const MONEY = '"$" #,##0.00';
const STATUS = { ok: 'Válida', anulada: 'Anulada', rechazada: 'Cancelada (pago no recibido)' };
const DARK = 'FF0F172A';
const ORANGE = 'FFF97316';

const z = (n) => String(n).padStart(2, '0');
const dmy = (ymd) => { const [y, m, d] = String(ymd).split('-'); return `${d}/${m}/${y}`; };
const nowText = () => { const d = new Date(); return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`; };
// Excel no tiene zona horaria: se guarda la hora local "tal cual" para que se vea igual que en la app.
const excelDate = (iso) => {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
};

function header(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.mergeCells(2, 1, 2, lastCol);
  Object.assign(ws.getCell(1, 1), { value: title, font: { bold: true, size: 16, color: { argb: DARK } } });
  Object.assign(ws.getCell(2, 1), { value: subtitle, font: { size: 11, color: { argb: 'FF64748B' } } });
  ws.getRow(1).height = 26;
}

function summaryBlock(ws, startRow, items) {
  items.forEach(([label, value, fmt], i) => {
    const r = startRow + i;
    Object.assign(ws.getCell(r, 1), { value: label, font: { bold: true } });
    const c = ws.getCell(r, 2);
    c.value = value;
    if (fmt) c.numFmt = fmt;
    c.alignment = { horizontal: 'right' };
  });
  return startRow + items.length;
}

function addTable(ws, name, ref, columns, rows, style = 'TableStyleMedium2') {
  ws.addTable({
    name,
    ref,
    headerRow: true,
    style: { theme: style, showRowStripes: true },
    columns: columns.map((c) => ({ name: c, filterButton: true })),
    rows: rows.length ? rows : [columns.map(() => null)],
  });
}

async function buildSalesWorkbook({ business, from, to, sales, labels, report }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'POS Comidas';
  wb.created = new Date();
  const period = from === to ? `del ${dmy(from)}` : `del ${dmy(from)} al ${dmy(to)}`;
  const methodName = (m) => labels[m] || m;

  // ---------- Hoja 1: Ventas ----------
  const ws = wb.addWorksheet('Ventas', { views: [{ state: 'frozen', ySplit: 9, showGridLines: false }] });
  const cols = [
    { name: 'Fecha', width: 12, fmt: 'dd/mm/yyyy', align: 'center' },
    { name: 'Hora', width: 8, fmt: 'hh:mm', align: 'center' },
    { name: 'Pedido', width: 9, align: 'center' },
    { name: 'Caja', width: 7, align: 'center' },
    { name: 'Cliente', width: 18 },
    { name: 'Detalle', width: 60, wrap: true },
    { name: 'Medios de pago', width: 22, wrap: true },
    { name: 'Descuento', width: 13, fmt: MONEY },
    { name: 'Total', width: 14, fmt: MONEY },
    { name: 'Estado', width: 16, align: 'center' },
  ];
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  header(ws, `Ventas — ${business}`, `Período ${period} · Exportado el ${nowText()}`, cols.length);

  const ok = sales.filter((s) => s.status === 'ok');
  const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  summaryBlock(ws, 4, [
    ['Ventas válidas', ok.length],
    ['Total vendido', sum(ok, 'total'), MONEY],
    ['Descuentos', sum(ok, 'discount'), MONEY],
    ['Anuladas / canceladas', sales.length - ok.length],
  ]);
  ws.getCell(5, 2).font = { bold: true, size: 12, color: { argb: ORANGE } };

  const top = 9; // fila del encabezado de la tabla
  const rows = sales.map((s) => {
    const d = excelDate(s.created_at);
    return [
      d, d, s.number, s.session_id, s.customer || '',
      s.detail || '',
      (s.methods || '').split(',').filter(Boolean).map(methodName).join(' + '),
      Number(s.discount || 0), Number(s.total || 0),
      STATUS[s.status] || s.status,
    ];
  });
  addTable(ws, 'Ventas', `A${top}`, cols.map((c) => c.name), rows);

  ws.getRow(top).height = 22;
  ws.getRow(top).alignment = { vertical: 'middle', horizontal: 'center' };
  for (let r = top + 1; r <= top + Math.max(rows.length, 1); r++) {
    const row = ws.getRow(r);
    row.alignment = { vertical: 'top' };
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { vertical: 'top', horizontal: c.align, wrapText: !!c.wrap };
    });
    const st = sales[r - top - 1]?.status;
    if (st && st !== 'ok') row.eachCell((cell) => { cell.font = { color: { argb: 'FFB91C1C' }, strike: st === 'anulada' }; });
  }

  // ---------- Hoja 2: Resumen ----------
  const rs = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  [34, 14, 16, 4, 34, 14, 16].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  header(rs, `Resumen — ${business}`, `Período ${period} · Solo ventas válidas`, 7);

  addTable(rs, 'PorMedio', 'A4', ['Medio de pago', 'Cobros', 'Total'],
    report.byMethod.map((m) => [methodName(m.method), m.n, m.total]), 'TableStyleMedium9');
  addTable(rs, 'PorProducto', 'E4', ['Producto', 'Cantidad', 'Total'],
    report.byProduct.map((p) => [p.name, p.qty, p.total]), 'TableStyleMedium9');
  const afterDays = 6 + Math.max(report.byMethod.length, 1);
  addTable(rs, 'PorDia', `A${afterDays}`, ['Día', 'Ventas', 'Total'],
    report.byDay.map((d) => [dmy(d.day), d.n, d.total]), 'TableStyleMedium9');

  rs.eachRow((row) => row.eachCell((cell, col) => {
    if ((col === 3 || col === 7) && typeof cell.value === 'number') cell.numFmt = MONEY;
    if ((col === 2 || col === 6) && typeof cell.value === 'number') cell.alignment = { horizontal: 'center' };
  }));

  return wb.xlsx.writeBuffer();
}

module.exports = { buildSalesWorkbook };
