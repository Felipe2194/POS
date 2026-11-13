import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AppCtx, money } from './lib.js';
import { Modal } from './components.jsx';
import logo from './logo.svg';
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
  const [collapsed, setCollapsed] = useState(false);
  const [update, setUpdate] = useState(null);
  const [askUpdate, setAskUpdate] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const unlocked = useRef(false);

  // Actualizaciones: se descargan solas, pero se instalan solo si el usuario acepta.
  // Se pregunta una vez por arranque; si dice "más tarde" queda el aviso en el menú.
  const asked = useRef(false);
  useEffect(() => {
    if (!api.update) return;
    const onState = (st) => {
      setUpdate(st);
      if (st.status === 'ready' && !asked.current) { asked.current = true; setAskUpdate(true); }
    };
    api.update.get().then(onState);
    return api.update.onState(onState);
  }, []);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);

  const [loadError, setLoadError] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const [s, sess, pend] = await Promise.all([
        api.db('getSettings'),
        api.db('currentSession'),
        api.db('listPayments', { status: 'pendiente' }),
      ]);
      setSettings(s);
      setSession(sess);
      setPending(pend.length);
      setLoadError(null);
    } catch (e) {
      console.error(e);
      setLoadError(String(e?.message || e).replace(/^Error invoking remote method '[^']+': /, ''));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  // Si falla la carga inicial se muestra igual la ventana (con el error), nunca queda en "Cargando…"
  useEffect(() => { if (loadError) api.ready?.(); }, [loadError]);
  useEffect(() => { if (settings) api.setZoom(settings.ui_zoom); }, [settings?.ui_zoom]);
  // Primera vez que todo está dibujado (con zoom aplicado): recién ahí se muestra la ventana
  const announced = useRef(false);
  useEffect(() => {
    if (!settings || announced.current) return;
    announced.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => api.ready?.()));
  }, [settings]);
  // se recuerda si la barra quedó colapsada
  useEffect(() => { if (settings) setCollapsed(settings.sidebar_collapsed === '1'); }, [settings?.sidebar_collapsed]);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    api.db('saveSettings', { sidebar_collapsed: next ? '1' : '0' });
  };

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

  if (!settings && loadError) {
    return (
      <div className="loading load-error">
        <h2>No se pudo iniciar el sistema</h2>
        <p className="muted">Tus datos no se perdieron. Probá reintentar; si sigue igual, avisá a soporte con este mensaje:</p>
        <code>{loadError}</code>
        {update?.status === 'ready' && (
          <p>Hay una versión nueva ({update.version}) lista que puede corregirlo.</p>
        )}
        <div className="row gap mt">
          {update?.status === 'ready' && (
            <button className="btn primary lg" onClick={() => api.update.install()}>Instalar versión {update.version}</button>
          )}
          <button className={'btn lg ' + (update?.status === 'ready' ? 'ghost' : 'primary')} onClick={refresh}>Reintentar</button>
          <button className="btn ghost lg" onClick={() => api.closeApp?.()}>Cerrar</button>
        </div>
      </div>
    );
  }
  if (!settings) return <div className="loading">Cargando…</div>;

  const ctx = { settings, session, refresh, toast, askPin, go };
  const Page = { venta: Venta, caja: Caja, pagos: Pagos, historial: Historial, productos: Productos, config: Config }[page];

  return (
    <AppCtx.Provider value={ctx}>
      <div className={'app ' + (collapsed ? 'collapsed' : '')}>
        <aside className="sidebar">
          <button className="brand" onClick={toggleSidebar} title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}>
            <img src={logo} alt="" className="logo" />
            <span className="brand-name">{settings.business_name}</span>
            <span className="brand-arrow">{collapsed ? '»' : '«'}</span>
          </button>
          <nav>
            {PAGES.map((p) => (
              <button key={p.id} title={p.label} className={'nav ' + (page === p.id ? 'active' : '')} onClick={() => go(p.id)}>
                <span className="ico">{p.icon}</span>
                <span className="lbl">{p.label}</span>
                {p.id === 'pagos' && pending > 0 && <span className="badge">{pending}</span>}
                <span className="key">{p.key}</span>
              </button>
            ))}
          </nav>
          <div className={'session ' + (session ? 'open' : 'closed')} onClick={() => go('caja')} title={session ? 'Caja abierta' : 'Caja cerrada'}>
            <div className="dot" />
            <span className="session-txt">
              {session ? (
                <>
                  Caja abierta #{session.id}
                  <small>{session.opened_by} · fondo {money(session.opening_amount)}</small>
                </>
              ) : (
                <>
                  Caja cerrada
                  <small>Abrí la caja para vender</small>
                </>
              )}
            </span>
          </div>
          {update?.status === 'ready' && (
            <button className="update-ready" onClick={() => setAskUpdate(true)} title={'Actualizar a la versión ' + update.version}>
              <span className="ico">⬆</span>
              <span className="lbl">Actualización lista<small>versión {update.version}</small></span>
            </button>
          )}
          <div className="win-btns">
            <button className="btn ghost" title="Minimizar" onClick={() => api.minimize?.()}>
              <span className="ico">▁</span><span className="lbl">Minimizar</span>
            </button>
            <button className="btn ghost" title="Cerrar el programa" onClick={() => setAskClose(true)}>
              <span className="ico">⏻</span><span className="lbl">Cerrar</span>
            </button>
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

      {askClose && (
        <Modal title="Cerrar el programa" onClose={() => setAskClose(false)} small>
          <p>¿Cerrar POS Comidas? Las ventas y la caja quedan guardadas.</p>
          <div className="row end mt">
            <button className="btn ghost lg" onClick={() => setAskClose(false)}>Cancelar</button>
            <button className="btn danger lg" onClick={() => api.closeApp()}>Cerrar</button>
          </div>
        </Modal>
      )}

      {askUpdate && update?.status === 'ready' && (
        <UpdateModal version={update.version} current={update.current} onClose={() => setAskUpdate(false)} />
      )}

      {pinAsk && (
        <PinModal
          reason={pinAsk.reason}
          onDone={(v) => { pinAsk.resolve(v); setPinAsk(null); }}
        />
      )}
    </AppCtx.Provider>
  );
}

function UpdateModal({ version, current, onClose }) {
  const [installing, setInstalling] = useState(false);
  return (
    <Modal title="Hay una nueva versión" onClose={installing ? undefined : onClose} small>
      <p>Está lista para instalar la versión <b>{version}</b>{current ? <> (tenés la {current})</> : null}.</p>
      <p className="muted">
        El programa se cierra y se vuelve a abrir solo en menos de un minuto. Las ventas, los productos
        y la caja abierta <b>no se pierden</b>, y antes se guarda una copia de seguridad.
      </p>
      <p className="muted">Si están atendiendo, elegí <b>Más tarde</b>: el aviso queda en el menú para cuando terminen.</p>
      <div className="row end mt">
        <button className="btn ghost lg" disabled={installing} onClick={onClose}>Más tarde</button>
        <button className="btn primary lg" disabled={installing} onClick={async () => { setInstalling(true); if (!(await api.update.install())) setInstalling(false); }}>
          {installing ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>
    </Modal>
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
