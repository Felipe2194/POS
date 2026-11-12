import { useEffect, useState } from 'react';
import { api, useApp } from '../lib.js';

const TABS = [
  { id: 'venta', label: 'Pantalla de venta' },
  { id: 'pagos', label: 'Medios de pago' },
  { id: 'ticketera', label: 'Ticketera' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'seguridad', label: 'Seguridad y copias' },
];
const FONT_SIZES = [
  { value: '0.85', label: 'Chica' },
  { value: '1', label: 'Normal' },
  { value: '1.25', label: 'Grande' },
  { value: '1.5', label: 'Muy grande' },
  { value: '1.75', label: 'Enorme' },
];

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const c = [...list];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <span className={'toggle ' + (checked ? 'on' : '')} onClick={(e) => { e.preventDefault(); onChange(!checked); }}><span /></span>
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
    </label>
  );
}

function Choice({ value, options, onChange }) {
  return (
    <div className="seg big">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function Config() {
  const { settings, refresh, toast } = useApp();
  const [s, setS] = useState(settings);
  const [tab, setTab] = useState('venta');
  const [printers, setPrinters] = useState([]);
  const [newNote, setNewNote] = useState('');
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  useEffect(() => { api.printers().then(setPrinters); }, []);
  // Al salir sin guardar, se vuelve al zoom guardado
  useEffect(() => () => api.setZoom(settings.ui_zoom), [settings.ui_zoom]);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const flag = (k) => s[k] !== '0';
  const setFlag = (k) => (v) => set(k, v ? '1' : '0');
  // actualizaciones funcionales: dos toques rápidos no se pisan entre sí
  const updList = (key, i, patch) => setS((x) => ({ ...x, [key]: x[key].map((m, k) => (k === i ? { ...m, ...patch } : m)) }));
  const setList = (key, fn) => setS((x) => ({ ...x, [key]: fn(x[key] || []) }));

  const save = async () => {
    const methods = s.payment_methods.filter((m) => m.label.trim());
    if (!methods.some((m) => m.active)) return toast('Tiene que haber al menos un medio de pago activo', 'error');
    const { order_types, default_order_type, sidebar_collapsed, ...rest } = s; // restos viejos y estado de la barra (se guarda aparte)
    await api.db('saveSettings', { ...rest, payment_methods: methods, low_stock: String(Math.max(0, parseInt(s.low_stock) || 0)) });
    await refresh();
    toast('Configuración guardada');
  };

  const zoom = Number(s.ui_zoom) || 1;
  const setZoom = (z) => { set('ui_zoom', String(z)); api.setZoom(z); };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Configuración</h1>
        <div className="row gap">
          {dirty && <span className="warn-text">Hay cambios sin guardar</span>}
          <button className="btn ghost" disabled={!dirty} onClick={() => { setS(settings); api.setZoom(settings.ui_zoom); }}>Descartar</button>
          <button className="btn primary" disabled={!dirty} onClick={save}>Guardar cambios</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'venta' && (
        <div className="two-col">
          <div className="card">
            <h3>Tamaño</h3>
            <label>Tamaño general de la aplicación</label>
            <div className="row gap">
              <button className="btn ghost" onClick={() => setZoom(Math.max(0.8, Math.round((zoom - 0.1) * 10) / 10))}>A−</button>
              <span className="zoom-value">{Math.round(zoom * 100)}%</span>
              <button className="btn ghost" onClick={() => setZoom(Math.min(1.6, Math.round((zoom + 0.1) * 10) / 10))}>A+</button>
              <button className="btn ghost" onClick={() => setZoom(1)}>Normal</button>
            </div>
            <p className="hint">Se aplica al instante para probar; guardá para dejarlo fijo.</p>
            <label className="mt">Tamaño de los botones de productos</label>
            <Choice value={s.tile_size || 'grande'} onChange={(v) => set('tile_size', v)} options={[
              { value: 'normal', label: 'Normal' }, { value: 'grande', label: 'Grande' }, { value: 'extra', label: 'Extra grande' },
            ]} />
          </div>

          <div className="card">
            <h3>Datos del pedido</h3>
            <label>Nombre del cliente</label>
            <Choice value={s.ask_customer || 'optional'} onChange={(v) => set('ask_customer', v)} options={[
              { value: 'hidden', label: 'No pedir' }, { value: 'optional', label: 'Opcional' }, { value: 'required', label: 'Obligatorio' },
            ]} />
            <div className="mt">
              <Toggle checked={flag('show_notes')} onChange={setFlag('show_notes')} label="Observaciones para cocina" hint="Campo de texto libre para todo el pedido" />
              <Toggle checked={flag('show_discount')} onChange={setFlag('show_discount')} label="Descuento" hint="Permite descontar un monto en pesos" />
              <Toggle checked={flag('allow_custom_item')} onChange={setFlag('allow_custom_item')} label="Ítem libre" hint="Vender algo que no está en la lista, con precio a mano" />
            </div>
            <label className="mt">Avisar “quedan pocos” cuando queden</label>
            <div className="row gap">
              <input className="input" type="number" min="0" style={{ width: 120 }} value={s.low_stock ?? '5'} onChange={(e) => set('low_stock', e.target.value)} />
              <span className="muted">unidades o menos (sólo productos con cantidad cargada)</span>
            </div>
          </div>

          <div className="card">
            <h3>Notas rápidas para cocina</h3>
            <p className="hint">Aparecen como botones al tocar un producto del pedido.</p>
            <div className="chips">
              {(s.quick_notes || []).map((n, i) => (
                <span key={i} className="chip editable">
                  {n}
                  <button onClick={() => setList('quick_notes', (l) => l.filter((_, k) => k !== i))}>✕</button>
                </span>
              ))}
            </div>
            <form className="row gap mt" onSubmit={(e) => { e.preventDefault(); if (newNote.trim()) { set('quick_notes', [...(s.quick_notes || []), newNote.trim()]); setNewNote(''); } }}>
              <input className="input grow" placeholder="Nueva nota (ej: Sin tomate)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              <button className="btn ghost">Agregar</button>
            </form>
          </div>
        </div>
      )}

      {tab === 'pagos' && (
        <div className="card">
          <h3>Medios de pago</h3>
          <p className="hint">Los activos aparecen como botones de cobro en la venta, en este orden. Los marcados con “Verificar” quedan pendientes en “Verificar pagos” hasta confirmar que llegaron. Desactivar un medio no borra las ventas que ya lo usaron.</p>
          <table className="table cfg">
            <thead><tr><th>Activo</th><th>Nombre</th><th>Verificar</th><th>Orden</th><th></th></tr></thead>
            <tbody>
              {s.payment_methods.map((m, i) => (
                <tr key={m.id} className={m.active ? '' : 'off'}>
                  <td><span className={'toggle ' + (m.active ? 'on' : '')} onClick={() => updList('payment_methods', i, { active: !m.active })}><span /></span></td>
                  <td><input className="input" value={m.label} onChange={(e) => updList('payment_methods', i, { label: e.target.value })} /></td>
                  <td>{m.id === 'efectivo' ? <span className="muted">—</span> : <span className={'toggle ' + (m.verify ? 'on' : '')} onClick={() => updList('payment_methods', i, { verify: !m.verify })}><span /></span>}</td>
                  <td className="nowrap">
                    <button className="btn ghost sm" onClick={() => setList('payment_methods', (l) => move(l, i, -1))}>▲</button>{' '}
                    <button className="btn ghost sm" onClick={() => setList('payment_methods', (l) => move(l, i, 1))}>▼</button>
                  </td>
                  <td>{m.id !== 'efectivo' && <button className="btn danger ghost sm" onClick={() => setList('payment_methods', (l) => l.filter((_, k) => k !== i))}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost mt" onClick={() => setList('payment_methods', (l) => [...l, { id: 'm' + Date.now(), label: 'Nuevo medio', verify: true, active: true }])}>+ Agregar medio de pago</button>
        </div>
      )}

      {tab === 'ticketera' && (
        <div className="two-col">
          <div className="card">
            <h3>Impresora</h3>
            <label>Ticketera</label>
            <select className="input" value={s.printer_name} onChange={(e) => set('printer_name', e.target.value)}>
              <option value="">— Ninguna —</option>
              {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (predeterminada)' : ''}</option>)}
            </select>
            <p className="hint">Instalá el driver de la ticketera en Windows y elegila acá. La impresión es directa, sin diálogo.</p>
            <label className="mt">Ancho del papel</label>
            <Choice value={s.paper_width} onChange={(v) => set('paper_width', v)} options={[{ value: '58', label: '58 mm' }, { value: '80', label: '80 mm' }]} />
            <div className="row gap mt">
              <button className="btn ghost" onClick={async () => { const r = await api.printTest(s); toast(r.ok ? 'Prueba enviada' : r.error, r.ok ? 'ok' : 'error'); }}>Imprimir prueba</button>
              <button className="btn ghost" onClick={() => api.printTest(s, { preview: true })}>Vista previa</button>
            </div>
          </div>
          <div className="card">
            <h3>Qué se imprime</h3>
            <Toggle checked={s.auto_print === '1'} onChange={setFlag('auto_print')} label="Imprimir automáticamente al cobrar" hint="Sale solo, sin frenar la venta" />
            <Toggle checked={s.print_ticket === '1'} onChange={setFlag('print_ticket')} label="Ticket para el cliente" hint="El cliente lo entrega en la cocina para retirar su pedido" />
            <Toggle checked={s.print_comanda === '1'} onChange={setFlag('print_comanda')} label="Comanda aparte para cocina (opcional)" hint="No hace falta si el cliente entrega el ticket. Usala sólo si la cocina necesita su propia copia para ir preparando (sale además del ticket)." />
            {s.print_comanda === '1' && (
              <>
                <label className="mt">Copias de comanda</label>
                <Choice value={String(s.comanda_copies || '1')} onChange={(v) => set('comanda_copies', v)} options={['1', '2', '3'].map((n) => ({ value: n, label: n }))} />
              </>
            )}
          </div>

          {[
            { kind: 'ticket', title: 'Letra del ticket del cliente', scaleKey: 'ticket_font_scale', boldKey: 'ticket_bold' },
            { kind: 'comanda', title: 'Letra de la comanda de cocina', scaleKey: 'comanda_font_scale', boldKey: 'comanda_bold' },
          ].filter((f) => f.kind === 'ticket' || s.print_comanda === '1').map((f) => (
            <div className="card" key={f.kind}>
              <h3>{f.title}</h3>
              <label>Tamaño</label>
              <Choice value={String(Number(s[f.scaleKey]) || 1)} onChange={(v) => set(f.scaleKey, v)} options={FONT_SIZES} />
              <div className="mt">
                <Toggle checked={s[f.boldKey] === '1'} onChange={setFlag(f.boldKey)} label="Todo en negrita" hint="Más oscuro y fácil de leer en papel térmico" />
              </div>
              <p className="hint">Con letra grande en papel de 58 mm, los nombres largos ocupan dos renglones.</p>
              <div className="row gap">
                <button className="btn ghost" onClick={() => api.printSample(s, f.kind, { preview: true })}>Vista previa</button>
                <button className="btn ghost" disabled={!s.printer_name} onClick={async () => { const r = await api.printSample(s, f.kind); toast(r.ok ? 'Ejemplo enviado a la ticketera' : r.error, r.ok ? 'ok' : 'error'); }}>Imprimir ejemplo</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'negocio' && (
        <div className="card narrow-l">
          <h3>Datos del negocio (encabezado del ticket)</h3>
          <label>Nombre</label>
          <input className="input" value={s.business_name} onChange={(e) => set('business_name', e.target.value)} />
          <label className="mt">Dirección</label>
          <input className="input" value={s.business_address} onChange={(e) => set('business_address', e.target.value)} />
          <label className="mt">Teléfono</label>
          <input className="input" value={s.business_phone} onChange={(e) => set('business_phone', e.target.value)} />
          <label className="mt">Pie del ticket</label>
          <input className="input" value={s.ticket_footer} onChange={(e) => set('ticket_footer', e.target.value)} />
        </div>
      )}

      {tab === 'seguridad' && (
        <div className="two-col">
          <div className="card">
            <h3>PIN de administrador</h3>
            <p className="hint">Si se carga un PIN, se pide para anular ventas y para entrar a Productos y Configuración. Vacío = sin PIN.</p>
            <input className="input" type="password" value={s.admin_pin} onChange={(e) => set('admin_pin', e.target.value)} placeholder="Sin PIN" />
          </div>
          <div className="card">
            <h3>Copias de seguridad</h3>
            <p className="hint">Todo se guarda en esta computadora. Se hace una copia automática por día (se guardan las últimas 30). Recomendado: guardar una copia en un pendrive cada semana.</p>
            <div className="row gap">
              <button className="btn primary" onClick={async () => { const f = await api.backupSave(); if (f) toast('Copia guardada en ' + f); }}>Guardar copia en…</button>
              <button className="btn ghost" onClick={() => api.backupOpenFolder()}>Abrir copias automáticas</button>
            </div>
          </div>
          <UpdatesCard />
        </div>
      )}
    </div>
  );
}

const UPDATE_TEXT = {
  idle: 'Todavía no se buscaron actualizaciones.',
  dev: 'Modo desarrollo: las actualizaciones solo funcionan en la versión instalada.',
  checking: 'Buscando…',
  none: 'Tenés la última versión.',
  downloading: 'Descargando la nueva versión…',
  ready: 'Hay una nueva versión lista para instalar (aviso en el menú).',
  error: 'No se pudo buscar (¿hay internet?). Se vuelve a intentar sola más tarde.',
};

function UpdatesCard() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!api.update) return;
    api.update.get().then(setSt);
    return api.update.onState((x) => setSt((prev) => ({ ...prev, ...x })));
  }, []);
  if (!st) return null;
  return (
    <div className="card">
      <h3>Actualizaciones</h3>
      <p>Versión instalada: <b>{st.current}</b></p>
      <p className="hint">
        Con internet, el programa busca versiones nuevas solo y las descarga sin interrumpir.
        Antes de instalar siempre pregunta.
      </p>
      <p className="hint">
        {UPDATE_TEXT[st.status] || ''}
        {st.status === 'downloading' && st.percent ? ` ${st.percent}%` : ''}
        {st.status === 'ready' && st.version ? ` (versión ${st.version})` : ''}
      </p>
      <button className="btn ghost" disabled={st.status === 'checking' || st.status === 'downloading'} onClick={() => api.update.check()}>
        Buscar actualizaciones
      </button>
    </div>
  );
}
