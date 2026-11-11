import { useEffect, useState } from 'react';
import { api, useApp } from '../lib.js';

export default function Config() {
  const { settings, refresh, toast } = useApp();
  const [s, setS] = useState(settings);
  const [printers, setPrinters] = useState([]);

  useEffect(() => { api.printers().then(setPrinters); }, []);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const setMethod = (i, patch) => set('payment_methods', s.payment_methods.map((m, k) => (k === i ? { ...m, ...patch } : m)));

  const save = async () => {
    const methods = s.payment_methods.filter((m) => m.label.trim());
    await api.db('saveSettings', { ...s, payment_methods: methods });
    await refresh();
    toast('Configuración guardada');
  };

  const check = (k) => (
    <input type="checkbox" checked={s[k] === '1'} onChange={(e) => set(k, e.target.checked ? '1' : '0')} />
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Configuración</h1>
        <button className="btn primary" onClick={save}>Guardar cambios</button>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Negocio (encabezado del ticket)</h3>
          <label>Nombre</label>
          <input className="input" value={s.business_name} onChange={(e) => set('business_name', e.target.value)} />
          <label className="mt">Dirección</label>
          <input className="input" value={s.business_address} onChange={(e) => set('business_address', e.target.value)} />
          <label className="mt">Teléfono</label>
          <input className="input" value={s.business_phone} onChange={(e) => set('business_phone', e.target.value)} />
          <label className="mt">Pie del ticket</label>
          <input className="input" value={s.ticket_footer} onChange={(e) => set('ticket_footer', e.target.value)} />

          <h3 className="mt-l">Seguridad</h3>
          <label>PIN de administrador (vacío = sin PIN)</label>
          <input className="input" type="password" value={s.admin_pin} onChange={(e) => set('admin_pin', e.target.value)} placeholder="Para anular ventas, editar productos y configuración" />
        </div>

        <div className="card">
          <h3>Ticketera</h3>
          <label>Impresora</label>
          <select className="input" value={s.printer_name} onChange={(e) => set('printer_name', e.target.value)}>
            <option value="">— Ninguna (mostrar vista previa en pantalla) —</option>
            {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (predeterminada)' : ''}</option>)}
          </select>
          <p className="muted small">Instalá el driver de la ticketera en Windows y elegila acá. La impresión es directa, sin diálogo.</p>
          <label className="mt">Ancho del papel</label>
          <div className="seg">
            {['58', '80'].map((w) => <button key={w} className={s.paper_width === w ? 'active' : ''} onClick={() => set('paper_width', w)}>{w} mm</button>)}
          </div>
          <div className="checks mt">
            <label>{check('auto_print')} Imprimir automáticamente al confirmar la venta</label>
            <label>{check('print_ticket')} Imprimir ticket para el cliente (con precios)</label>
            <label>{check('print_comanda')} Imprimir comanda para cocina (letra grande, sin precios)</label>
          </div>
          <label className="mt">Copias de comanda</label>
          <input className="input auto" type="number" min="1" max="5" value={s.comanda_copies} onChange={(e) => set('comanda_copies', e.target.value)} />
          <div className="row gap mt">
            <button className="btn ghost" onClick={async () => { const r = await api.printTest(s); toast(r.ok ? 'Prueba enviada' : r.error, r.ok ? 'ok' : 'error'); }}>Imprimir prueba</button>
            <button className="btn ghost" onClick={() => api.printTest(s, { preview: true })}>Vista previa</button>
          </div>
        </div>

        <div className="card">
          <h3>Medios de pago</h3>
          <p className="muted small">Los marcados con “verificar” aparecen en la pantalla “Verificar pagos” hasta que alguien confirme que llegaron.</p>
          <table className="table compact">
            <thead><tr><th>Nombre</th><th>Verificar</th><th></th></tr></thead>
            <tbody>
              {s.payment_methods.map((m, i) => (
                <tr key={m.id}>
                  <td><input className="input sm" value={m.label} onChange={(e) => setMethod(i, { label: e.target.value })} /></td>
                  <td>{m.id === 'efectivo' ? <span className="muted">—</span> : <input type="checkbox" checked={!!m.verify} onChange={(e) => setMethod(i, { verify: e.target.checked })} />}</td>
                  <td>{m.id !== 'efectivo' && <button className="link" onClick={() => set('payment_methods', s.payment_methods.filter((_, k) => k !== i))}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost mt" onClick={() => set('payment_methods', [...s.payment_methods, { id: 'm' + Date.now(), label: 'Nuevo medio', verify: true }])}>+ Agregar medio de pago</button>
        </div>

        <div className="card">
          <h3>Copias de seguridad</h3>
          <p className="muted small">Todo se guarda en esta computadora. Se hace una copia automática por día (se guardan las últimas 30). Recomendado: guardar una copia en un pendrive cada semana.</p>
          <div className="row gap">
            <button className="btn primary" onClick={async () => { const f = await api.backupSave(); if (f) toast('Copia guardada en ' + f); }}>Guardar copia en…</button>
            <button className="btn ghost" onClick={() => api.backupOpenFolder()}>Abrir carpeta de copias automáticas</button>
          </div>
        </div>
      </div>
    </div>
  );
}
