import { useEffect, useMemo, useRef, useState } from 'react';
import { api, money, parseNum, ORDER_TYPES, useApp } from '../lib.js';
import { Modal } from '../components.jsx';

export default function Venta() {
  const { session, settings, toast, refresh, go } = useApp();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('mostrador');
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [paying, setPaying] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [custom, setCustom] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const searchRef = useRef();

  useEffect(() => {
    Promise.all([api.db('listProducts'), api.db('listCategories')]).then(([p, c]) => { setProducts(p); setCategories(c); });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F9' && cart.length && session) { e.preventDefault(); setPaying(true); }
      if (e.key === 'F8') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart, session]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => (cat === 'all' || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, cat, search]);

  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const disc = Math.min(parseNum(discount), subtotal);
  const total = Math.max(0, subtotal - disc);

  const add = (p) => {
    setCart((c) => {
      const idx = c.findIndex((i) => i.product_id === p.id && !i.notes && i.price === p.price);
      if (idx >= 0) return c.map((i, k) => (k === idx ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { key: Math.random(), product_id: p.id, name: p.name, price: p.price, qty: 1, notes: '' }];
    });
  };
  const setQty = (key, qty) => setCart((c) => (qty <= 0 ? c.filter((i) => i.key !== key) : c.map((i) => (i.key === key ? { ...i, qty } : i))));
  const clear = () => { setCart([]); setCustomer(''); setNotes(''); setDiscount(''); setOrderType('mostrador'); };

  const onSaved = async (sale) => {
    setPaying(false);
    setLastSale(sale);
    clear();
    refresh();
    toast(`Venta #${sale.number} registrada — ${money(sale.total)}`);
    if (settings.auto_print === '1') {
      const r = await api.printSale(sale.id);
      if (!r.ok) toast('No se pudo imprimir: ' + r.error, 'error');
    }
  };

  if (!session) {
    return (
      <div className="empty-state">
        <div className="big-ico">💵</div>
        <h2>La caja está cerrada</h2>
        <p className="muted">Para registrar ventas primero abrí la caja con el fondo inicial.</p>
        <button className="btn primary lg" onClick={() => go('caja')}>Abrir caja</button>
      </div>
    );
  }

  return (
    <div className="pos">
      <section className="catalog">
        <div className="catalog-top">
          <input ref={searchRef} className="input" placeholder="Buscar producto (F8)…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn ghost" onClick={() => setCustom(true)}>+ Ítem libre</button>
        </div>
        <div className="cats">
          <button className={'cat ' + (cat === 'all' ? 'active' : '')} onClick={() => setCat('all')}>Todos</button>
          {categories.map((c) => (
            <button key={c.id} className={'cat ' + (cat === c.id ? 'active' : '')} style={{ '--c': c.color }} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <div className="grid">
          {visible.map((p) => (
            <button key={p.id} className="prod" style={{ '--c': p.category_color || '#64748b' }} onClick={() => add(p)}>
              <span className="prod-name">{p.name}</span>
              <span className="prod-price">{money(p.price)}</span>
            </button>
          ))}
          {!visible.length && <div className="muted pad">No hay productos. Cargalos en “Productos”.</div>}
        </div>
      </section>

      <section className="order">
        <div className="order-head">
          <div className="seg">
            {ORDER_TYPES.map((t) => (
              <button key={t.id} className={orderType === t.id ? 'active' : ''} onClick={() => setOrderType(t.id)}>{t.label}</button>
            ))}
          </div>
          <input className="input" placeholder={orderType === 'mesa' ? 'N° de mesa' : 'Nombre del cliente (opcional)'} value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>

        <div className="items">
          {!cart.length && <div className="muted center pad">Tocá un producto para agregarlo</div>}
          {cart.map((i) => (
            <div key={i.key} className="item">
              <div className="item-main" onClick={() => setEditItem(i)}>
                <div className="item-name">{i.name}</div>
                {i.notes && <div className="item-note">→ {i.notes}</div>}
                <div className="item-unit muted">{money(i.price)} c/u · tocá para nota</div>
              </div>
              <div className="qty">
                <button onClick={() => setQty(i.key, i.qty - 1)}>−</button>
                <span>{i.qty}</span>
                <button onClick={() => setQty(i.key, i.qty + 1)}>+</button>
              </div>
              <div className="item-total">{money(i.price * i.qty)}</div>
            </div>
          ))}
        </div>

        <div className="order-foot">
          <input className="input" placeholder="Observaciones para cocina (sin sal, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="totals">
            <div className="row between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="row between center-y">
              <span>Descuento $</span>
              <input className="input sm right" style={{ width: 120 }} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </div>
            <div className="row between total"><span>TOTAL</span><span>{money(total)}</span></div>
          </div>
          <div className="row gap">
            <button className="btn ghost" disabled={!cart.length} onClick={clear}>Vaciar</button>
            <button className="btn primary lg grow" disabled={!cart.length} onClick={() => setPaying(true)}>Cobrar (F9)</button>
          </div>
          {lastSale && (
            <div className="last-sale">
              Última: <b>#{lastSale.number}</b> {money(lastSale.total)}
              <button className="link" onClick={async () => { const r = await api.printSale(lastSale.id); if (!r.ok) toast(r.error, 'error'); }}>Reimprimir</button>
            </div>
          )}
        </div>
      </section>

      {paying && (
        <PayModal
          total={total}
          onClose={() => setPaying(false)}
          onConfirm={async (payments, cash) => {
            try {
              const sale = await api.db('createSale', {
                items: cart, discount: disc, payments, customer, notes, order_type: orderType,
                cash_received: cash?.received, change_given: cash?.change,
              });
              onSaved(sale);
            } catch (e) { toast(cleanErr(e), 'error'); }
          }}
        />
      )}

      {editItem && (
        <ItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(upd) => { setCart((c) => c.map((i) => (i.key === upd.key ? upd : i))); setEditItem(null); }}
          onRemove={() => { setQty(editItem.key, 0); setEditItem(null); }}
        />
      )}

      {custom && (
        <CustomItemModal
          onClose={() => setCustom(false)}
          onSave={(it) => { setCart((c) => [...c, { key: Math.random(), product_id: null, qty: 1, notes: '', ...it }]); setCustom(false); }}
        />
      )}
    </div>
  );
}

export const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function PayModal({ total, onClose, onConfirm }) {
  const { settings } = useApp();
  const methods = settings.payment_methods;
  const [lines, setLines] = useState([{ method: 'efectivo', amount: total, reference: '' }]);
  const [mixed, setMixed] = useState(false);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);

  const paid = lines.reduce((a, l) => a + parseNum(l.amount), 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const cashLine = lines.find((l) => l.method === 'efectivo');
  const cashAmount = cashLine ? parseNum(cashLine.amount) : 0;
  const rec = parseNum(received);
  const change = cashLine && rec > 0 ? rec - cashAmount : 0;
  const ok = Math.abs(remaining) < 0.01 && (!cashLine || !rec || rec >= cashAmount);

  const pick = (m) => setLines([{ method: m, amount: total, reference: '' }]);
  const upd = (k, patch) => setLines((ls) => ls.map((l, i) => (i === k ? { ...l, ...patch } : l)));

  // Sugerencias de "paga con": redondeos hacia arriba al billete más cercano
  const bills = [...new Set([1000, 2000, 5000, 10000, 20000].map((b) => Math.ceil(cashAmount / b) * b))]
    .filter((b) => b > cashAmount).sort((a, b) => a - b).slice(0, 4);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    await onConfirm(
      lines.map((l) => ({ ...l, amount: parseNum(l.amount) })),
      cashLine && rec > 0 ? { received: rec, change } : null
    );
    setBusy(false);
  };

  return (
    <Modal title={`Cobrar ${money(total)}`} onClose={onClose}>
      {!mixed ? (
        <>
          <div className="pay-methods">
            {methods.map((m) => (
              <button key={m.id} className={'pay-btn ' + (lines[0].method === m.id ? 'active' : '')} onClick={() => pick(m.id)}>{m.label}</button>
            ))}
          </div>
          {lines[0].method !== 'efectivo' && (
            <input className="input mt" placeholder="Referencia / N° operación / nombre de quien transfiere (opcional)" value={lines[0].reference} onChange={(e) => upd(0, { reference: e.target.value })} />
          )}
          <button className="link mt" onClick={() => setMixed(true)}>Dividir en varios medios de pago</button>
        </>
      ) : (
        <>
          {lines.map((l, k) => (
            <div key={k} className="row gap mb">
              <select className="input" value={l.method} onChange={(e) => upd(k, { method: e.target.value })}>
                {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <input className="input right" style={{ width: 140 }} value={l.amount} onChange={(e) => upd(k, { amount: e.target.value })} />
              <input className="input grow" placeholder="Referencia" value={l.reference} onChange={(e) => upd(k, { reference: e.target.value })} />
              {lines.length > 1 && <button className="btn icon ghost" onClick={() => setLines((ls) => ls.filter((_, i) => i !== k))}>✕</button>}
            </div>
          ))}
          <div className="row between">
            <button className="btn ghost" onClick={() => setLines((ls) => [...ls, { method: 'transferencia', amount: Math.max(0, remaining), reference: '' }])}>+ Agregar pago</button>
            <span className={remaining === 0 ? 'ok-text' : 'bad-text'}>{remaining === 0 ? 'Completo' : `Falta ${money(remaining)}`}</span>
          </div>
        </>
      )}

      {cashLine && (
        <div className="cash-box mt">
          <label>Paga con (efectivo)</label>
          <div className="row gap">
            <input className="input big right grow" autoFocus value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(cashAmount)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
          <div className="row gap mt-s">
            <button className="btn ghost sm" onClick={() => setReceived(String(cashAmount))}>Justo</button>
            {bills.map((b) => <button key={b} className="btn ghost sm" onClick={() => setReceived(String(b))}>{money(b)}</button>)}
          </div>
          {rec > 0 && (
            <div className={'change ' + (change < 0 ? 'bad-text' : '')}>
              {change < 0 ? `Faltan ${money(-change)}` : <>Vuelto: <b>{money(change)}</b></>}
            </div>
          )}
        </div>
      )}

      <div className="row end gap mt">
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary lg" disabled={!ok || busy} onClick={submit}>Confirmar venta (Enter)</button>
      </div>
    </Modal>
  );
}

function ItemModal({ item, onClose, onSave, onRemove }) {
  const [it, setIt] = useState(item);
  const quick = ['Sin sal', 'Sin cebolla', 'Sin mayonesa', 'Bien cocido', 'Para llevar', 'Extra queso'];
  return (
    <Modal title={item.name} onClose={onClose} small>
      <label>Nota para cocina</label>
      <input className="input" autoFocus value={it.notes} onChange={(e) => setIt({ ...it, notes: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onSave(it)} />
      <div className="chips mt-s">
        {quick.map((q) => <button key={q} className="chip" onClick={() => setIt({ ...it, notes: it.notes ? `${it.notes}, ${q}` : q })}>{q}</button>)}
      </div>
      <div className="row gap mt">
        <div className="grow"><label>Cantidad</label><input className="input" type="number" min="1" value={it.qty} onChange={(e) => setIt({ ...it, qty: Math.max(1, parseInt(e.target.value) || 1) })} /></div>
        <div className="grow"><label>Precio unitario</label><input className="input" value={it.price} onChange={(e) => setIt({ ...it, price: parseNum(e.target.value) })} /></div>
      </div>
      <div className="row between mt">
        <button className="btn danger ghost" onClick={onRemove}>Quitar</button>
        <button className="btn primary" onClick={() => onSave(it)}>Guardar</button>
      </div>
    </Modal>
  );
}

function CustomItemModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const submit = (e) => { e.preventDefault(); if (name && parseNum(price) >= 0) onSave({ name, price: parseNum(price) }); };
  return (
    <Modal title="Ítem libre" onClose={onClose} small>
      <form onSubmit={submit}>
        <label>Descripción</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <label className="mt">Precio</label>
        <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
        <div className="row end mt"><button className="btn primary">Agregar</button></div>
      </form>
    </Modal>
  );
}
