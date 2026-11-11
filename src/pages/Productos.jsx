import { useEffect, useState } from 'react';
import { api, money, parseNum, useApp } from '../lib.js';
import { Modal } from '../components.jsx';
import { cleanErr } from './Venta.jsx';

const COLORS = ['#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

export default function Productos() {
  const { toast } = useApp();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editP, setEditP] = useState(null);
  const [editC, setEditC] = useState(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const [p, c] = await Promise.all([api.db('listProducts', { includeInactive: true }), api.db('listCategories')]);
    setProducts(p.filter((x) => x.active !== -1));
    setCategories(c);
  };
  useEffect(() => { load(); }, []);

  const saveP = async (p) => {
    try { await api.db('saveProduct', { ...p, price: parseNum(p.price) }); setEditP(null); load(); toast('Producto guardado'); }
    catch (e) { toast(cleanErr(e), 'error'); }
  };
  const saveC = async (c) => {
    if (!c.name) return;
    await api.db('saveCategory', c); setEditC(null); load(); toast('Categoría guardada');
  };

  const shown = products.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Productos y precios</h1>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setEditC({ name: '', color: COLORS[0], sort: categories.length + 1 })}>+ Categoría</button>
          <button className="btn primary" onClick={() => setEditP({ name: '', price: '', category_id: categories[0]?.id || null, active: 1 })}>+ Producto</button>
        </div>
      </div>

      <div className="cats mb">
        {categories.map((c) => (
          <button key={c.id} className="cat" style={{ '--c': c.color }} onClick={() => setEditC(c)}>{c.name} ✎</button>
        ))}
      </div>
      <input className="input auto mb" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />

      <table className="table">
        <thead><tr><th>Producto</th><th>Categoría</th><th className="r">Precio</th><th>Visible en venta</th><th></th></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'voided'}>
              <td className="b">{p.name}</td>
              <td>{p.category_name ? <span className="dot-c" style={{ '--c': p.category_color }}>{p.category_name}</span> : <span className="muted">—</span>}</td>
              <td className="r">{money(p.price)}</td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={!!p.active} onChange={() => saveP({ ...p, active: p.active ? 0 : 1 })} />
                  <span>{p.active ? 'Sí' : 'No (sin stock)'}</span>
                </label>
              </td>
              <td className="r nowrap">
                <button className="link" onClick={() => setEditP(p)}>Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editP && (
        <Modal title={editP.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setEditP(null)} small>
          <form onSubmit={(e) => { e.preventDefault(); saveP(editP); }}>
            <label>Nombre</label>
            <input className="input" autoFocus required value={editP.name} onChange={(e) => setEditP({ ...editP, name: e.target.value })} />
            <label className="mt">Precio</label>
            <input className="input big right" required value={editP.price} onChange={(e) => setEditP({ ...editP, price: e.target.value })} />
            <label className="mt">Categoría</label>
            <select className="input" value={editP.category_id || ''} onChange={(e) => setEditP({ ...editP, category_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="mt">Orden</label>
            <input className="input" type="number" value={editP.sort || 0} onChange={(e) => setEditP({ ...editP, sort: Number(e.target.value) })} />
            <div className="row between mt">
              {editP.id ? (
                <button type="button" className="btn danger ghost" onClick={async () => { await api.db('deleteProduct', editP.id); setEditP(null); load(); toast('Producto eliminado'); }}>Eliminar</button>
              ) : <span />}
              <button className="btn primary">Guardar</button>
            </div>
          </form>
        </Modal>
      )}

      {editC && (
        <Modal title={editC.id ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setEditC(null)} small>
          <form onSubmit={(e) => { e.preventDefault(); saveC(editC); }}>
            <label>Nombre</label>
            <input className="input" autoFocus required value={editC.name} onChange={(e) => setEditC({ ...editC, name: e.target.value })} />
            <label className="mt">Color</label>
            <div className="row gap">
              {COLORS.map((c) => (
                <button type="button" key={c} className={'swatch ' + (editC.color === c ? 'active' : '')} style={{ background: c }} onClick={() => setEditC({ ...editC, color: c })} />
              ))}
            </div>
            <label className="mt">Orden</label>
            <input className="input" type="number" value={editC.sort || 0} onChange={(e) => setEditC({ ...editC, sort: Number(e.target.value) })} />
            <div className="row between mt">
              {editC.id ? (
                <button type="button" className="btn danger ghost" onClick={async () => { await api.db('deleteCategory', editC.id); setEditC(null); load(); }}>Eliminar</button>
              ) : <span />}
              <button className="btn primary">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
