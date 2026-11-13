// Capa de datos: SQLite local (100% offline).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let dbFile;

const DEFAULT_SETTINGS = {
  business_name: 'Mi Comedor',
  business_address: '',
  business_phone: '',
  ticket_footer: '¡Gracias por su compra!',
  printer_name: '',
  paper_width: '80', // mm: 58 u 80
  print_ticket: '1', // ticket para el cliente
  print_comanda: '0', // comanda aparte para cocina (en festivales el cliente entrega el ticket)
  comanda_copies: '1',
  ticket_font_scale: '1', // tamaño de letra del ticket (0.85 a 1.75)
  comanda_font_scale: '1.25', // la comanda arranca un poco más grande
  ticket_bold: '0',
  comanda_bold: '1', // en térmicas la negrita se lee mejor desde la cocina
  auto_print: '1',
  admin_pin: '',
  payment_methods: JSON.stringify([
    { id: 'efectivo', label: 'Efectivo', verify: false, active: true },
    { id: 'transferencia', label: 'Transferencia', verify: true, active: true },
    { id: 'mercadopago', label: 'Mercado Pago (QR)', verify: true, active: true },
    { id: 'debito', label: 'Débito', verify: true, active: true },
    { id: 'credito', label: 'Crédito', verify: true, active: true },
  ]),
  // Pantalla de venta (festival: todo se retira en el mostrador, no hay tipo de pedido)
  ask_customer: 'optional', // hidden | optional | required
  show_notes: '1',
  show_discount: '1',
  allow_custom_item: '1',
  quick_notes: JSON.stringify(['Sin sal', 'Sin cebolla', 'Sin mayonesa', 'Bien cocido', 'Para llevar', 'Extra queso']),
  tile_size: 'grande', // normal | grande | extra
  ui_zoom: '1',
  low_stock: '5', // avisar cuando queden esta cantidad o menos
  sidebar_collapsed: '0',
};
const JSON_KEYS = ['payment_methods', 'quick_notes'];

function init(userDataDir) {
  const dataDir = path.join(userDataDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  dbFile = path.join(dataDir, 'pos.sqlite');
  db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL'); // prioriza no perder ventas ante un corte de luz
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#f97316',
      sort INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      category_id INTEGER REFERENCES categories(id),
      active INTEGER DEFAULT 1,
      sort INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at TEXT NOT NULL,
      opened_by TEXT,
      opening_amount REAL NOT NULL DEFAULT 0,
      closed_at TEXT,
      closed_by TEXT,
      expected_cash REAL,
      counted_cash REAL,
      difference REAL,
      summary_json TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'abierta'
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
      type TEXT NOT NULL CHECK (type IN ('ingreso','egreso')),
      amount REAL NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      day TEXT NOT NULL,
      session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
      created_at TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      cash_received REAL,
      change_given REAL,
      customer TEXT,
      order_type TEXT DEFAULT 'mostrador',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      void_reason TEXT,
      voided_at TEXT,
      cashier TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      verify_status TEXT NOT NULL DEFAULT 'no_aplica',
      verified_at TEXT,
      verify_note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(session_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_pay_status ON sale_payments(verify_status);
  `);

  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);

  // Migración: cantidad disponible por producto (NULL = sin control de cantidad)
  const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!cols.includes('stock')) db.exec('ALTER TABLE products ADD COLUMN stock REAL');
  if (!cols.includes('stock_loaded')) db.exec('ALTER TABLE products ADD COLUMN stock_loaded REAL');

  // Migración (una vez): el ticket del cliente es el comprobante para retirar en la cocina,
  // así que la comanda aparte queda apagada en instalaciones existentes.
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'mig_comanda_off'").get()) {
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'print_comanda'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('mig_comanda_off', '1')").run();
  }
  // Ventas con un pago rechazado de versiones anteriores: dejan de contar como vendidas
  db.prepare(`UPDATE sales SET status = 'rechazada', void_reason = 'Pago no recibido'
    WHERE status = 'ok' AND id IN (SELECT sale_id FROM sale_payments WHERE verify_status = 'rechazado')`).run();

  // Datos de ejemplo la primera vez
  const count = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (count === 0) seed();

  return dbFile;
}

function seed() {
  const tx = db.transaction(() => {
    const cat = db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)');
    const prod = db.prepare('INSERT INTO products (name, price, category_id, sort) VALUES (?, ?, ?, ?)');
    const c1 = cat.run('Platos', '#f97316', 1).lastInsertRowid;
    const c2 = cat.run('Sándwiches', '#eab308', 2).lastInsertRowid;
    const c3 = cat.run('Bebidas', '#3b82f6', 3).lastInsertRowid;
    const c4 = cat.run('Postres', '#ec4899', 4).lastInsertRowid;
    prod.run('Milanesa con papas', 9500, c1, 1);
    prod.run('Pastas del día', 8000, c1, 2);
    prod.run('Empanada', 1500, c1, 3);
    prod.run('Hamburguesa completa', 8500, c2, 1);
    prod.run('Lomito', 10500, c2, 2);
    prod.run('Gaseosa 500ml', 2500, c3, 1);
    prod.run('Agua 500ml', 1800, c3, 2);
    prod.run('Flan casero', 3000, c4, 1);
  });
  tx();
}

const now = () => new Date().toISOString();
const localDay = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------- Configuración ----------
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  for (const k of JSON_KEYS) {
    try { s[k] = JSON.parse(s[k]); } catch { s[k] = JSON.parse(DEFAULT_SETTINGS[k]); }
  }
  // compatibilidad: medios de pago creados antes del flag "active"
  s.payment_methods = s.payment_methods.map((m) => ({ ...m, active: m.active !== false }));
  return s;
}
function saveSettings(obj) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(obj)) {
      up.run(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  });
  tx();
  return getSettings();
}
function checkPin(pin) {
  const s = getSettings();
  return !s.admin_pin || s.admin_pin === String(pin || '');
}

// ---------- Catálogo ----------
function listCategories() {
  return db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort, name').all();
}
function saveCategory(c) {
  if (c.id) {
    db.prepare('UPDATE categories SET name=?, color=?, sort=? WHERE id=?').run(c.name, c.color || '#f97316', c.sort || 0, c.id);
    return c.id;
  }
  return db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)').run(c.name, c.color || '#f97316', c.sort || 0).lastInsertRowid;
}
function deleteCategory(id) {
  db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(id);
  db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(id);
}
function listProducts({ includeInactive = false } = {}) {
  return db.prepare(`
    SELECT p.*, c.name AS category_name, c.color AS category_color
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ${includeInactive ? 'WHERE p.active >= 0' : 'WHERE p.active = 1'}
    ORDER BY c.sort, p.sort, p.name`).all();
}
const cleanStock = (v) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v) || 0)));
function saveProduct(p) {
  const price = round2(p.price);
  if (!p.name || !(price >= 0)) throw new Error('Nombre y precio son obligatorios');
  const stock = cleanStock(p.stock);
  if (p.id) {
    const prev = db.prepare('SELECT stock, stock_loaded FROM products WHERE id = ?').get(p.id) || {};
    // "cargado" acompaña los cambios manuales para poder mostrar "quedan X de Y"
    let loaded = null;
    if (stock != null) loaded = prev.stock == null ? stock : Math.max(stock, (prev.stock_loaded ?? prev.stock) + (stock - prev.stock));
    db.prepare('UPDATE products SET name=?, price=?, category_id=?, active=?, sort=?, stock=?, stock_loaded=? WHERE id=?')
      .run(p.name, price, p.category_id || null, p.active ? 1 : 0, p.sort || 0, stock, loaded, p.id);
    return p.id;
  }
  return db.prepare('INSERT INTO products (name, price, category_id, active, sort, stock, stock_loaded) VALUES (?, ?, ?, 1, ?, ?, ?)')
    .run(p.name, price, p.category_id || null, p.sort || 0, stock, stock).lastInsertRowid;
}
// Suma unidades a un producto (llegó más mercadería). Si no tenía control de cantidad, lo activa.
function addStock({ id, qty }) {
  const n = Math.round(Number(qty) || 0);
  if (!n) throw new Error('Cantidad inválida');
  const p = db.prepare('SELECT stock, stock_loaded FROM products WHERE id = ?').get(id);
  if (!p) throw new Error('Producto inexistente');
  const stock = Math.max(0, (p.stock || 0) + n);
  const loaded = Math.max(stock, (p.stock_loaded ?? p.stock ?? 0) + n);
  db.prepare('UPDATE products SET stock = ?, stock_loaded = ? WHERE id = ?').run(stock, loaded, id);
  return { stock, stock_loaded: loaded };
}
function deleteProduct(id) {
  // borrado lógico para no romper el historial
  db.prepare('UPDATE products SET active = -1 WHERE id = ?').run(id);
}

// ---------- Caja ----------
function currentSession() {
  return db.prepare("SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1").get() || null;
}
function openSession({ opening_amount, opened_by }) {
  if (currentSession()) throw new Error('Ya hay una caja abierta');
  const id = db.prepare('INSERT INTO cash_sessions (opened_at, opened_by, opening_amount) VALUES (?, ?, ?)')
    .run(now(), opened_by || '', round2(opening_amount)).lastInsertRowid;
  return getSession(id);
}
function getSession(id) {
  return db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id);
}
function addMovement({ type, amount, reason }) {
  const s = currentSession();
  if (!s) throw new Error('No hay caja abierta');
  const a = round2(amount);
  if (!(a > 0)) throw new Error('Monto inválido');
  db.prepare('INSERT INTO cash_movements (session_id, type, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(s.id, type, a, reason || '', now());
}
function sessionSummary(sessionId) {
  const s = getSession(sessionId);
  if (!s) throw new Error('Caja inexistente');
  const settings = getSettings();
  const labels = Object.fromEntries(settings.payment_methods.map((m) => [m.id, m.label]));

  const byMethod = db.prepare(`
    SELECT p.method, SUM(p.amount) total, COUNT(*) n,
      SUM(CASE WHEN p.verify_status = 'pendiente' THEN p.amount ELSE 0 END) pendiente,
      SUM(CASE WHEN p.verify_status = 'verificado' THEN p.amount ELSE 0 END) verificado,
      SUM(CASE WHEN p.verify_status = 'rechazado' THEN p.amount ELSE 0 END) rechazado
    FROM sale_payments p JOIN sales v ON v.id = p.sale_id
    WHERE v.session_id = ? AND v.status = 'ok'
    GROUP BY p.method`).all(sessionId).map((r) => ({ ...r, label: labels[r.method] || r.method }));

  const totals = db.prepare(`
    SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(discount),0) discount
    FROM sales WHERE session_id = ? AND status = 'ok'`).get(sessionId);
  const voided = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM sales WHERE session_id = ? AND status = 'anulada'`).get(sessionId);
  const rejected = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM sales WHERE session_id = ? AND status = 'rechazada'`).get(sessionId);
  const movements = db.prepare('SELECT * FROM cash_movements WHERE session_id = ? ORDER BY id').all(sessionId);
  const ingresos = movements.filter((m) => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0);
  const egresos = movements.filter((m) => m.type === 'egreso').reduce((a, m) => a + m.amount, 0);
  const cashSales = byMethod.find((m) => m.method === 'efectivo')?.total || 0;
  const topProducts = db.prepare(`
    SELECT i.name, SUM(i.qty) qty, SUM(i.qty * i.price) total
    FROM sale_items i JOIN sales v ON v.id = i.sale_id
    WHERE v.session_id = ? AND v.status = 'ok'
    GROUP BY i.name ORDER BY qty DESC`).all(sessionId);

  return {
    session: s,
    totals,
    voided,
    rejected,
    byMethod,
    movements,
    ingresos: round2(ingresos),
    egresos: round2(egresos),
    cashSales: round2(cashSales),
    expectedCash: round2(s.opening_amount + cashSales + ingresos - egresos),
    topProducts,
  };
}
function closeSession({ counted_cash, closed_by, notes }) {
  const s = currentSession();
  if (!s) throw new Error('No hay caja abierta');
  const sum = sessionSummary(s.id);
  const counted = round2(counted_cash);
  db.prepare(`UPDATE cash_sessions SET closed_at=?, closed_by=?, expected_cash=?, counted_cash=?, difference=?, summary_json=?, notes=?, status='cerrada' WHERE id=?`)
    .run(now(), closed_by || '', sum.expectedCash, counted, round2(counted - sum.expectedCash), JSON.stringify(sum), notes || '', s.id);
  return sessionSummary(s.id);
}
function listSessions({ limit = 60 } = {}) {
  return db.prepare(`
    SELECT s.*, (SELECT COALESCE(SUM(total),0) FROM sales v WHERE v.session_id = s.id AND v.status='ok') total_ventas,
           (SELECT COUNT(*) FROM sales v WHERE v.session_id = s.id AND v.status='ok') n_ventas
    FROM cash_sessions s ORDER BY s.id DESC LIMIT ?`).all(limit);
}

// ---------- Ventas ----------
function createSale(input) {
  const s = currentSession();
  if (!s) throw new Error('Abrí la caja antes de vender');
  const items = (input.items || []).filter((i) => i.qty > 0);
  if (!items.length) throw new Error('La venta no tiene productos');

  const settings = getSettings();
  const verifyMap = Object.fromEntries(settings.payment_methods.map((m) => [m.id, !!m.verify]));

  const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
  const discount = Math.min(round2(input.discount || 0), subtotal);
  const total = round2(subtotal - discount);
  const payments = (input.payments || []).filter((p) => p.amount > 0).map((p) => ({ ...p, amount: round2(p.amount) }));
  const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(paid - total) > 0.009) throw new Error(`Los pagos (${paid}) no coinciden con el total (${total})`);

  const day = localDay();
  const tx = db.transaction(() => {
    const number = db.prepare('SELECT COALESCE(MAX(number),0) + 1 n FROM sales WHERE day = ?').get(day).n;
    const saleId = db.prepare(`
      INSERT INTO sales (number, day, session_id, created_at, subtotal, discount, total, cash_received, change_given, customer, order_type, notes, cashier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      number, day, s.id, now(), subtotal, discount, total,
      input.cash_received != null ? round2(input.cash_received) : null,
      input.change_given != null ? round2(input.change_given) : null,
      input.customer || '', input.order_type || 'mostrador', input.notes || '', s.opened_by || ''
    ).lastInsertRowid;
    const insItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, name, price, qty, notes) VALUES (?, ?, ?, ?, ?, ?)');
    for (const i of items) insItem.run(saleId, i.product_id || null, i.name, round2(i.price), i.qty, i.notes || '');
    // Control de cantidad dentro de la transacción: nunca se vende de más
    const need = {};
    for (const i of items) if (i.product_id) need[i.product_id] = (need[i.product_id] || 0) + i.qty;
    const getP = db.prepare('SELECT name, stock FROM products WHERE id = ?');
    const decr = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL');
    for (const [pid, qty] of Object.entries(need)) {
      const p = getP.get(pid);
      if (!p || p.stock == null) continue;
      if (p.stock < qty) throw new Error(p.stock <= 0 ? `No queda más ${p.name}` : `Sólo quedan ${p.stock} de ${p.name}`);
      decr.run(qty, pid);
    }
    const insPay = db.prepare('INSERT INTO sale_payments (sale_id, method, amount, reference, verify_status) VALUES (?, ?, ?, ?, ?)');
    for (const p of payments) insPay.run(saleId, p.method, p.amount, p.reference || '', verifyMap[p.method] ? 'pendiente' : 'no_aplica');
    return saleId;
  });
  return getSale(tx());
}
function getSale(id) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return null;
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id);
  sale.payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id').all(id);
  return sale;
}
function listSales({ from, to, sessionId, status, q, limit = 1000 } = {}) {
  const where = [];
  const args = [];
  if (sessionId) { where.push('v.session_id = ?'); args.push(sessionId); }
  if (from) { where.push('v.day >= ?'); args.push(from); }
  if (to) { where.push('v.day <= ?'); args.push(to); }
  if (status) { where.push('v.status = ?'); args.push(status); }
  if (q) { where.push('(v.customer LIKE ? OR CAST(v.number AS TEXT) = ?)'); args.push(`%${q}%`, q); }
  const rows = db.prepare(`
    SELECT v.*, (SELECT GROUP_CONCAT(method, ',') FROM sale_payments p WHERE p.sale_id = v.id) methods,
      (SELECT GROUP_CONCAT(CAST(qty AS INTEGER) || 'x ' || name, ', ') FROM sale_items i WHERE i.sale_id = v.id) detail
    FROM sales v ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY v.id DESC LIMIT ?`).all(...args, limit);
  return rows;
}
function voidSale({ id, reason, pin }) {
  if (!checkPin(pin)) throw new Error('PIN incorrecto');
  const sale = getSale(id);
  if (!sale) throw new Error('Venta inexistente');
  if (sale.status === 'anulada') throw new Error('La venta ya está anulada');
  if (sale.status === 'rechazada') throw new Error('La venta ya está cancelada por pago no recibido');
  const sess = getSession(sale.session_id);
  if (sess.status !== 'abierta') throw new Error('No se puede anular una venta de una caja ya cerrada');
  db.transaction(() => {
    db.prepare("UPDATE sales SET status='anulada', void_reason=?, voided_at=? WHERE id=?").run(reason || '', now(), id);
    // las unidades vuelven a estar disponibles
    const back = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL');
    for (const i of sale.items) if (i.product_id) back.run(i.qty, i.product_id);
  })();
  return getSale(id);
}

// ---------- Verificación de pagos ----------
function listPayments({ status = 'pendiente', method, from, to } = {}) {
  const where = ["v.status IN ('ok', 'rechazada')", "p.verify_status != 'no_aplica'"];
  const args = [];
  if (status && status !== 'todos') { where.push('p.verify_status = ?'); args.push(status); }
  if (method) { where.push('p.method = ?'); args.push(method); }
  if (from) { where.push('v.day >= ?'); args.push(from); }
  if (to) { where.push('v.day <= ?'); args.push(to); }
  return db.prepare(`
    SELECT p.*, v.number, v.day, v.created_at, v.customer, v.total sale_total, v.session_id, v.status sale_status
    FROM sale_payments p JOIN sales v ON v.id = p.sale_id
    WHERE ${where.join(' AND ')}
    ORDER BY v.id DESC LIMIT ?`).all(...args, limit);
}
// Si el pago no llegó, el pedido queda cancelado (status 'rechazada'): no suma en ventas ni en caja
// y las unidades vuelven a estar disponibles. "Deshacer" lo vuelve a activar.
function setPaymentStatus({ id, status, note, reference }) {
  if (!['pendiente', 'verificado', 'rechazado'].includes(status)) throw new Error('Estado inválido');
  const pay = db.prepare('SELECT * FROM sale_payments WHERE id = ?').get(id);
  if (!pay) throw new Error('Pago inexistente');
  const sale = getSale(pay.sale_id);
  if (sale.status === 'anulada') throw new Error('La venta está anulada');
  db.transaction(() => {
    db.prepare('UPDATE sale_payments SET verify_status=?, verified_at=?, verify_note=COALESCE(?, verify_note), reference=COALESCE(?, reference) WHERE id=?')
      .run(status, status === 'pendiente' ? null : now(), note ?? null, reference ?? null, id);
    const anyRejected = db.prepare("SELECT COUNT(*) c FROM sale_payments WHERE sale_id = ? AND verify_status = 'rechazado'").get(sale.id).c > 0;
    if (anyRejected && sale.status === 'ok') {
      db.prepare("UPDATE sales SET status='rechazada', void_reason=?, voided_at=? WHERE id=?").run('Pago no recibido' + (note ? ': ' + note : ''), now(), sale.id);
      const back = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL');
      for (const i of sale.items) if (i.product_id) back.run(i.qty, i.product_id);
    } else if (!anyRejected && sale.status === 'rechazada') {
      db.prepare("UPDATE sales SET status='ok', void_reason=NULL, voided_at=NULL WHERE id=?").run(sale.id);
      const take = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND stock IS NOT NULL');
      for (const i of sale.items) if (i.product_id) take.run(i.qty, i.product_id);
    }
  })();
  return getSale(sale.id);
}

// ---------- Reportes ----------
function report({ from, to }) {
  const byDay = db.prepare(`
    SELECT day, COUNT(*) n, SUM(total) total FROM sales
    WHERE status='ok' AND day BETWEEN ? AND ? GROUP BY day ORDER BY day`).all(from, to);
  const byMethod = db.prepare(`
    SELECT p.method, SUM(p.amount) total, COUNT(*) n FROM sale_payments p JOIN sales v ON v.id=p.sale_id
    WHERE v.status='ok' AND v.day BETWEEN ? AND ? GROUP BY p.method ORDER BY total DESC`).all(from, to);
  const byProduct = db.prepare(`
    SELECT i.name, SUM(i.qty) qty, SUM(i.qty*i.price) total FROM sale_items i JOIN sales v ON v.id=i.sale_id
    WHERE v.status='ok' AND v.day BETWEEN ? AND ? GROUP BY i.name ORDER BY total DESC`).all(from, to);
  return { byDay, byMethod, byProduct };
}

// ---------- Backups ----------
async function backupTo(file) {
  await db.backup(file);
  return file;
}
async function autoBackup(userDataDir) {
  const dir = path.join(userDataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pos-${localDay()}.sqlite`);
  if (!fs.existsSync(file)) await db.backup(file);
  // conservar los últimos 30
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(dir, f));
  return dir;
}

module.exports = {
  init,
  getDbFile: () => dbFile,
  api: {
    getSettings, saveSettings, checkPin,
    listCategories, saveCategory, deleteCategory,
    listProducts, saveProduct, deleteProduct, addStock,
    currentSession, openSession, addMovement, sessionSummary, closeSession, listSessions, getSession,
    createSale, getSale, listSales, voidSale,
    listPayments, setPaymentStatus,
    report,
  },
  backupTo, autoBackup,
};
