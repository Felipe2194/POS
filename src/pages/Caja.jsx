import { useEffect, useState } from 'react';
import { api, money, parseNum, fmtDateTime, useApp } from '../lib.js';
import { Modal, Stat, StatusPill } from '../components.jsx';
import { cleanErr } from './Venta.jsx';

export default function Caja() {
  const { session, refresh, toast } = useApp();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [mov, setMov] = useState(null);
  const [closing, setClosing] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    setHistory(await api.db('listSessions'));
    setSummary(session ? await api.db('sessionSummary', session.id) : null);
  };
  useEffect(() => { load(); }, [session]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Caja</h1>
        {session && (
          <div className="row gap">
            <button className="btn ghost" onClick={() => setMov('ingreso')}>+ Ingreso</button>
            <button className="btn ghost" onClick={() => setMov('egreso')}>− Egreso / Retiro</button>
            <button className="btn ghost" onClick={() => api.printClose(session.id)}>Imprimir parcial</button>
            <button className="btn danger" onClick={() => setClosing(true)}>Cerrar caja</button>
          </div>
        )}
      </div>

      {!session ? <OpenForm onOpened={() => { refresh(); toast('Caja abierta'); }} /> : summary && <SummaryView sum={summary} />}

      <h2 className="mt-l">Historial de cajas</h2>
      <table className="table">
        <thead><tr><th>#</th><th>Apertura</th><th>Cierre</th><th>Cajero</th><th className="r">Ventas</th><th className="r">Esperado</th><th className="r">Contado</th><th className="r">Diferencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td>{h.id}</td>
              <td>{fmtDateTime(h.opened_at)}</td>
              <td>{fmtDateTime(h.closed_at)}</td>
              <td>{h.opened_by}{h.closed_by && h.closed_by !== h.opened_by ? ` / ${h.closed_by}` : ''}</td>
              <td className="r">{money(h.total_ventas)} <small className="muted">({h.n_ventas})</small></td>
              <td className="r">{h.expected_cash != null ? money(h.expected_cash) : '—'}</td>
              <td className="r">{h.counted_cash != null ? money(h.counted_cash) : '—'}</td>
              <td className={'r ' + (h.difference < 0 ? 'bad-text' : h.difference > 0 ? 'ok-text' : '')}>{h.difference != null ? money(h.difference) : '—'}</td>
              <td><StatusPill status={h.status} /></td>
              <td className="r">
                <button className="link" onClick={async () => setViewing(await api.db('sessionSummary', h.id))}>Ver</button>{' '}
                <button className="link" onClick={() => api.printClose(h.id)}>Imprimir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mov && (
        <MovementModal type={mov} onClose={() => setMov(null)} onSaved={() => { setMov(null); load(); toast('Movimiento registrado'); }} />
      )}
      {closing && summary && (
        <CloseModal sum={summary} onClose={() => setClosing(false)} onClosed={async (res) => {
          setClosing(false);
          toast('Caja cerrada');
          const r = await api.printClose(res.session.id);
          if (!r.ok) toast('No se pudo imprimir el cierre: ' + r.error, 'error');
          refresh();
        }} />
      )}
      {viewing && (
        <Modal title={`Caja #${viewing.session.id}`} onClose={() => setViewing(null)} wide>
          <SummaryView sum={viewing} />
        </Modal>
      )}
    </div>
  );
}

function OpenForm({ onOpened }) {
  const { toast } = useApp();
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.db('openSession', { opening_amount: parseNum(amount), opened_by: name });
      onOpened();
    } catch (err) { toast(cleanErr(err), 'error'); }
  };
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Abrir caja</h2>
      <label>Cajero/a</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" autoFocus />
      <label className="mt">Fondo inicial en efectivo (cambio)</label>
      <input className="input big right" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      <button className="btn primary lg full mt">Abrir caja</button>
    </form>
  );
}

export function SummaryView({ sum }) {
  const s = sum.session;
  return (
    <>
      <div className="muted mb">
        Abierta {fmtDateTime(s.opened_at)} por {s.opened_by || '—'}
        {s.closed_at && <> · Cerrada {fmtDateTime(s.closed_at)} por {s.closed_by || '—'}</>}
      </div>
      <div className="stats">
        <Stat label="Total vendido" value={money(sum.totals.total)} sub={`${sum.totals.n} ventas`} tone="primary" />
        <Stat label="Efectivo esperado en caja" value={money(sum.expectedCash)} sub={`fondo ${money(s.opening_amount)} + ventas ${money(sum.cashSales)} + ing. ${money(sum.ingresos)} − egr. ${money(sum.egresos)}`} />
        {s.status === 'cerrada' && <Stat label="Diferencia de arqueo" value={money(s.difference)} tone={s.difference < 0 ? 'bad' : s.difference > 0 ? 'ok' : ''} sub={`contado ${money(s.counted_cash)}`} />}
        {sum.voided.n > 0 && <Stat label="Anuladas" value={sum.voided.n} sub={money(sum.voided.total)} tone="bad" />}
      </div>

      <div className="two-col mt">
        <div className="card">
          <h3>Por medio de pago</h3>
          <table className="table compact">
            <thead><tr><th>Medio</th><th className="r">Cant.</th><th className="r">Total</th><th className="r">Pend. verificar</th></tr></thead>
            <tbody>
              {sum.byMethod.map((m) => (
                <tr key={m.method}>
                  <td>{m.label}</td><td className="r">{m.n}</td><td className="r b">{money(m.total)}</td>
                  <td className={'r ' + (m.pendiente > 0 ? 'warn-text' : 'muted')}>{m.method === 'efectivo' ? '—' : money(m.pendiente)}</td>
                </tr>
              ))}
              {!sum.byMethod.length && <tr><td colSpan="4" className="muted">Sin ventas todavía</td></tr>}
            </tbody>
          </table>
          {sum.movements.length > 0 && (
            <>
              <h3 className="mt">Movimientos de efectivo</h3>
              <table className="table compact">
                <tbody>
                  {sum.movements.map((m) => (
                    <tr key={m.id}><td>{fmtDateTime(m.created_at)}</td><td>{m.reason}</td><td className={'r ' + (m.type === 'egreso' ? 'bad-text' : 'ok-text')}>{m.type === 'egreso' ? '−' : '+'}{money(m.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="card">
          <h3>Productos vendidos</h3>
          <table className="table compact">
            <tbody>
              {sum.topProducts.map((p) => <tr key={p.name}><td>{p.name}</td><td className="r">{p.qty}</td><td className="r">{money(p.total)}</td></tr>)}
              {!sum.topProducts.length && <tr><td className="muted">—</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MovementModal({ type, onClose, onSaved }) {
  const { toast } = useApp();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.db('addMovement', { type, amount: parseNum(amount), reason }); onSaved(); }
    catch (err) { toast(cleanErr(err), 'error'); }
  };
  return (
    <Modal title={type === 'ingreso' ? 'Ingreso de efectivo' : 'Egreso / retiro de efectivo'} onClose={onClose} small>
      <form onSubmit={submit}>
        <label>Monto</label>
        <input className="input big right" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className="mt">Motivo</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'egreso' ? 'Pago a proveedor, retiro, compra de insumos…' : 'Cambio adicional…'} />
        <div className="row end mt"><button className="btn primary">Guardar</button></div>
      </form>
    </Modal>
  );
}

function CloseModal({ sum, onClose, onClosed }) {
  const { session, toast } = useApp();
  const [counted, setCounted] = useState('');
  const [name, setName] = useState(session.opened_by || '');
  const [notes, setNotes] = useState('');
  const diff = parseNum(counted) - sum.expectedCash;
  const pending = sum.byMethod.reduce((a, m) => a + (m.method !== 'efectivo' ? m.pendiente : 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (counted === '') return toast('Ingresá el efectivo contado', 'error');
    try { onClosed(await api.db('closeSession', { counted_cash: parseNum(counted), closed_by: name, notes })); }
    catch (err) { toast(cleanErr(err), 'error'); }
  };

  return (
    <Modal title="Cerrar caja" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="stats">
          <Stat label="Total vendido" value={money(sum.totals.total)} sub={`${sum.totals.n} ventas`} />
          <Stat label="Efectivo esperado" value={money(sum.expectedCash)} tone="primary" />
        </div>
        {pending > 0 && (
          <div className="alert warn mt">Hay {money(pending)} en pagos electrónicos sin verificar. Podés cerrar igual y verificarlos después en “Verificar pagos”.</div>
        )}
        <label className="mt">Efectivo contado en caja</label>
        <input className="input big right" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" />
        {counted !== '' && (
          <div className={'change ' + (Math.abs(diff) < 0.01 ? 'ok-text' : diff < 0 ? 'bad-text' : 'warn-text')}>
            {Math.abs(diff) < 0.01 ? 'La caja cierra justa ✓' : diff < 0 ? `Faltante: ${money(-diff)}` : `Sobrante: ${money(diff)}`}
          </div>
        )}
        <div className="row gap mt">
          <div className="grow"><label>Cierra</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grow"><label>Observaciones</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="row end gap mt">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn danger lg">Confirmar cierre</button>
        </div>
      </form>
    </Modal>
  );
}
