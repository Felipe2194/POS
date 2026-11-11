import { useEffect, useState } from 'react';
import { api, money, fmtDateTime, today, useApp } from '../lib.js';
import { Modal, Stat, StatusPill } from '../components.jsx';

// Control de transferencias / QR / tarjetas: el personal revisa en el homebanking
// o app de Mercado Pago y marca cada cobro como verificado o rechazado.
export default function Pagos() {
  const { settings, refresh, toast } = useApp();
  const [status, setStatus] = useState('pendiente');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState([]);
  const labels = Object.fromEntries(settings.payment_methods.map((m) => [m.id, m.label]));
  const verifiable = settings.payment_methods.filter((m) => m.verify);

  const load = async () => setRows(await api.db('listPayments', { status, method: method || undefined, from: from || undefined, to: to || undefined }));
  useEffect(() => { load(); }, [status, method, from, to]);

  const [rejecting, setRejecting] = useState(null);

  const set = async (row, st, note) => {
    if (st === 'rechazado' && note === undefined) return setRejecting({ row, note: row.verify_note || '' });
    await api.db('setPaymentStatus', { id: row.id, status: st, note });
    toast(st === 'verificado' ? 'Pago verificado ✓' : st === 'rechazado' ? 'Pago marcado como rechazado' : 'Vuelto a pendiente');
    load();
    refresh();
  };

  const sumBy = (st) => rows.filter((r) => r.verify_status === st).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="page">
      <div className="page-head"><h1>Verificar pagos</h1></div>
      <p className="muted">Revisá en el homebanking o en la app de cobro que cada transferencia haya llegado y marcala. Los pagos rechazados quedan registrados para reclamar.</p>

      <div className="filters">
        <div className="seg">
          {['pendiente', 'verificado', 'rechazado', 'todos'].map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        <select className="input auto" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Todos los medios</option>
          {verifiable.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <label className="inline">Desde <input type="date" className="input auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">Hasta <input type="date" className="input auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <div className="stats">
        <Stat label="Cobros listados" value={rows.length} />
        {(status === 'pendiente' || status === 'todos') && <Stat label="Pendiente de verificar" value={money(sumBy('pendiente'))} tone="warn" />}
        {(status === 'verificado' || status === 'todos') && <Stat label="Verificado" value={money(sumBy('verificado'))} tone="ok" />}
        {(status === 'rechazado' || status === 'todos') && <Stat label="Rechazado" value={money(sumBy('rechazado'))} tone="bad" />}
      </div>

      <table className="table mt">
        <thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Medio</th><th>Referencia</th><th className="r">Monto</th><th>Estado</th><th className="r">Acciones</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.created_at)}</td>
              <td>#{r.number}</td>
              <td>{r.customer || <span className="muted">—</span>}</td>
              <td>{labels[r.method] || r.method}</td>
              <td>{r.reference || <span className="muted">—</span>}{r.verify_note && <div className="muted small">{r.verify_note}</div>}</td>
              <td className="r b">{money(r.amount)}</td>
              <td><StatusPill status={r.verify_status} />{r.verified_at && <div className="muted small">{fmtDateTime(r.verified_at)}</div>}</td>
              <td className="r nowrap">
                {r.verify_status !== 'verificado' && <button className="btn ok" onClick={() => set(r, 'verificado')}>✓ Llegó</button>}{' '}
                {r.verify_status !== 'rechazado' && <button className="btn danger ghost" onClick={() => set(r, 'rechazado')}>✕ No llegó</button>}{' '}
                {r.verify_status !== 'pendiente' && <button className="btn ghost" onClick={() => set(r, 'pendiente')}>Deshacer</button>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="8" className="muted center pad">No hay pagos {status !== 'todos' ? status + 's' : ''} con esos filtros 🎉</td></tr>}
        </tbody>
      </table>

      {rejecting && (
        <Modal title={`Rechazar pago del pedido #${rejecting.row.number}`} onClose={() => setRejecting(null)} small>
          <form onSubmit={(e) => { e.preventDefault(); set(rejecting.row, 'rechazado', rejecting.note); setRejecting(null); }}>
            <label>Motivo (no llegó, monto distinto, etc.)</label>
            <input className="input" autoFocus value={rejecting.note} onChange={(e) => setRejecting({ ...rejecting, note: e.target.value })} />
            <div className="row end gap mt">
              <button type="button" className="btn ghost" onClick={() => setRejecting(null)}>Cancelar</button>
              <button className="btn danger">Marcar rechazado</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
