import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AppCtx, money } from './lib.js';
import { Modal } from './components.jsx';
import Venta from './pages/Venta.jsx';
import Caja from './pages/Caja.jsx';
import Pagos from './pages/Pagos.jsx';
import Historial from './pages/Historial.jsx';
import Productos from './pages/Productos.jsx';
import Config from './pages/Config.jsx';

const PAGES = [
  { id: 'venta', label: 'Vender', icon: '🛒', key: 'F1' },
  { id: 'caja', label: 'Caja', icon: '💵', key: 'F2' },
  { id: 'pagos', label: 'Verificar pagos', icon: '✅', key: 'F3' },
  { id: 'historial', label: 'Ventas', icon: '🧾', key: 'F4' },
  { id: 'productos', label: 'Productos', icon: '🍔', key: 'F5', admin: true },
  { id: 'config', label: 'Configuración', icon: '⚙️', key: 'F6', admin: true },
];

export default function App() {
  const [page, setPage] = useState('venta');
  const [settings, setSettings] = useState(null);
  const [session, setSession] = useState(null);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [pinAsk, setPinAsk] = useState(null);
  const unlocked = useRef(false);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);

  const refresh = useCallback(async () => {
    const [s, sess, pend] = await Promise.all([
      api.db('getSettings'),
      api.db('currentSession'),
      api.db('listPayments', { status: 'pendiente' }),
    ]);
    setSettings(s);
    setSession(sess);
    setPending(pend.length);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Pide el PIN de administrador (si está configurado). Devuelve el PIN o null.
  const askPin = useCallback((reason) => {
    return new Promise((resolve) => {
      if (!settings?.admin_pin) return resolve('');
      setPinAsk({ reason, resolve });
    });
  }, [settings]);

  const go = useCallback(async (id) => {
    const p = PAGES.find((x) => x.id === id);
    if (p?.admin && settings?.admin_pin && !unlocked.current) {
      const pin = await askPin('Acceso a ' + p.label);
      if (pin == null) return;
      if (!(await api.db('checkPin', pin))) return toast('PIN incorrecto', 'error');
      unlocked.current = true;
    }
    setPage(id);
  }, [settings, askPin, toast]);

  useEffect(() => {
    const onKey = (e) => {
      const p = PAGES.find((x) => x.key === e.key);
      if (p) { e.preventDefault(); go(p.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Al volver a la venta se vuelve a bloquear el área de administración
  useEffect(() => { if (page === 'venta') unlocked.current = false; }, [page]);

  if (!settings) return <div className="loading">Cargando…</div>;

  const ctx = { settings, session, refresh, toast, askPin, go };
  const Page = { venta: Venta, caja: Caja, pagos: Pagos, historial: Historial, productos: Productos, config: Config }[page];

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">{settings.business_name}</div>
          <nav>
            {PAGES.map((p) => (
              <button key={p.id} className={'nav ' + (page === p.id ? 'active' : '')} onClick={() => go(p.id)}>
                <span className="ico">{p.icon}</span>
                <span className="lbl">{p.label}</span>
                {p.id === 'pagos' && pending > 0 && <span className="badge">{pending}</span>}
                <span className="key">{p.key}</span>
              </button>
            ))}
          </nav>
          <div className={'session ' + (session ? 'open' : 'closed')} onClick={() => go('caja')}>
            {session ? (
              <>
                <div className="dot" /> Caja abierta #{session.id}
                <small>{session.opened_by} · fondo {money(session.opening_amount)}</small>
              </>
            ) : (
              <>
                <div className="dot" /> Caja cerrada
                <small>Abrí la caja para vender</small>
              </>
            )}
          </div>
          <div className="offline">● Modo local (sin internet)</div>
        </aside>
        <main className="content">
          <Page />
        </main>
      </div>

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}
      </div>

      {pinAsk && (
        <PinModal
          reason={pinAsk.reason}
          onDone={(v) => { pinAsk.resolve(v); setPinAsk(null); }}
        />
      )}
    </AppCtx.Provider>
  );
}

function PinModal({ reason, onDone }) {
  const [pin, setPin] = useState('');
  return (
    <Modal title="PIN de administrador" onClose={() => onDone(null)} small>
      <p className="muted">{reason}</p>
      <form onSubmit={(e) => { e.preventDefault(); onDone(pin); }}>
        <input className="input big center" type="password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
        <div className="row end mt">
          <button type="button" className="btn ghost" onClick={() => onDone(null)}>Cancelar</button>
          <button className="btn primary">Aceptar</button>
        </div>
      </form>
    </Modal>
  );
}
