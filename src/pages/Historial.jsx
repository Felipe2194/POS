import { useEffect, useState } from 'react';
import { api, money, fmtDateTime, today, toCsv, VERIFY_LABELS, useApp } from '../lib.js';
import { Modal, Stat, StatusPill } from '../components.jsx';
import { cleanErr } from './Venta.jsx';

export default function Historial() {
  const { settings, toast, askPin, refresh } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [detail, setDetail] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const labels = Object.fromEntries(settings.payment_methods.map((m) => [m.id, m.label]));

  const load = async () => {
    setRows(await api.db('listSales', { from, to, status: status || undefined, q: q.trim() || undefined }));
    setReport(await api.db('report', { from, to }));
  };
  useEffect(() => { load(); }, [from, to, status, q]);

  const ok = rows.filter((r) => r.status === 'ok');
  const total = ok.reduce((a, r) => a + r.total, 0);

  const exportCsv = async () => {
    const csv = toCsv(rows, [
      { label: 'Fecha', get: (r) => fmtDateTime(r.created_at) },
      { label: 'Pedido', get: (r) => r.number },
      { label: 'Tipo', get: (r) => settings.order_types.find((t) => t.id === r.order_type)?.label || r.order_type },
      { label: 'Cliente', get: (r) => r.customer },
      { label: 'Detalle', get: (r) => r.detail },
      { label: 'Medios de pago', get: (r) => (r.methods || '').split(',').map((m) => labels[m] || m).join(' + ') },
      { label: 'Descuento', get: (r) => r.discount },
      { label: 'Total', get: (r) => r.total },
      { label: 'Estado', get: (r) => r.status },
      { label: 'Caja', get: (r) => r.session_id },
    ]);
    const f = await api.exportCsv(`ventas_${from}_a_${to}.csv`, csv);
    if (f) toast('Exportado a ' + f);
  };

  const doVoid = async (sale, reason) => {
    const pin = await askPin('Anular venta #' + sale.number);
    if (pin == null) return;
    try {
      await api.db('voidSale', { id: sale.id, reason, pin });
      toast(`Venta #${sale.number} anulada`);
      setVoiding(null); setDetail(null); load(); refresh();
    } catch (e) { toast(cleanErr(e), 'error'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Ventas</h1>
        <button className="btn ghost" onClick={exportCsv}>Exportar a Excel (CSV)</button>
      </div>
      <div className="filters">
        <label className="inline">Desde <input type="date" className="input auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">Hasta <input type="date" className="input auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select className="input auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option><option value="ok">Válidas</option><option value="anulada">Anuladas</option>
        </select>
        <input className="input auto" placeholder="Buscar cliente o N° pedido" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="stats">
        <Stat label="Total del período" value={money(total)} sub={`${ok.length} ventas`} tone="primary" />
        <Stat label="Ticket promedio" value={money(ok.length ? total / ok.length : 0)} />
        {report?.byMethod.map((m) => <Stat key={m.method} label={labels[m.method] || m.method} value={money(m.total)} sub={`${m.n} cobros`} />)}
      </div>

      <div className="two-col wide-left mt">
        <table className="table">
          <thead><tr><th>Fecha</th><th>#</th><th>Cliente</th><th>Detalle</th><th>Pago</th><th className="r">Total</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={'clickable ' + (r.status === 'anulada' ? 'voided' : '')} onClick={async () => setDetail(await api.db('getSale', r.id))}>
                <td className="nowrap">{fmtDateTime(r.created_at)}</td>
                <td>{r.number}</td>
                <td>{r.customer}</td>
                <td className="ellipsis">{r.detail}</td>
                <td>{(r.methods || '').split(',').map((m) => labels[m] || m).join(' + ')}</td>
                <td className="r b">{money(r.total)}</td>
                <td><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7" className="muted center pad">Sin ventas en el período</td></tr>}
          </tbody>
        </table>
        <div className="card">
          <h3>Más vendidos</h3>
          <table className="table compact">
            <tbody>
              {report?.byProduct.slice(0, 20).map((p) => <tr key={p.name}><td>{p.name}</td><td className="r">{p.qty}</td><td className="r">{money(p.total)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <Modal title={`Pedido #${detail.number} — ${fmtDateTime(detail.created_at)}`} onClose={() => setDetail(null)}>
          <div className="row gap mb">
            <StatusPill status={detail.status} />
            <span>{settings.order_types.find((t) => t.id === detail.order_type)?.label || detail.order_type}</span>
            {detail.customer && <b>{detail.customer}</b>}
            <span className="muted">Caja #{detail.session_id}</span>
          </div>
          {detail.status === 'anulada' && <div className="alert bad mb">Anulada {fmtDateTime(detail.voided_at)}: {detail.void_reason}</div>}
          <table className="table compact">
            <tbody>
              {detail.items.map((i) => (
                <tr key={i.id}><td>{i.qty} x {i.name}{i.notes && <div className="muted small">→ {i.notes}</div>}</td><td className="r">{money(i.price * i.qty)}</td></tr>
              ))}
              {detail.discount > 0 && <tr><td>Descuento</td><td className="r">−{money(detail.discount)}</td></tr>}
              <tr className="b"><td>TOTAL</td><td className="r">{money(detail.total)}</td></tr>
            </tbody>
          </table>
          <h3 className="mt">Pagos</h3>
          <table className="table compact">
            <tbody>
              {detail.payments.map((p) => (
                <tr key={p.id}><td>{labels[p.method] || p.method}</td><td>{p.reference}</td><td>{VERIFY_LABELS[p.verify_status]}</td><td className="r">{money(p.amount)}</td></tr>
              ))}
              {detail.cash_received ? <tr><td colSpan="3">Recibido / vuelto</td><td className="r">{money(detail.cash_received)} / {money(detail.change_given)}</td></tr> : null}
            </tbody>
          </table>
          {detail.notes && <p><b>Obs:</b> {detail.notes}</p>}
          <div className="row between mt">
            {detail.status === 'ok' ? <button className="btn danger ghost" onClick={() => setVoiding({ sale: detail, reason: '' })}>Anular venta</button> : <span />}
            <div className="row gap">
              <button className="btn ghost" onClick={() => api.printSale(detail.id, { ticket: false, comanda: true, preview: !settings.printer_name })}>Reimprimir comanda</button>
              <button className="btn primary" onClick={() => api.printSale(detail.id, { ticket: true, comanda: false, preview: !settings.printer_name })}>Reimprimir ticket</button>
            </div>
          </div>
        </Modal>
      )}

      {voiding && (
        <Modal title={`Anular venta #${voiding.sale.number}`} onClose={() => setVoiding(null)} small>
          <form onSubmit={(e) => { e.preventDefault(); doVoid(voiding.sale, voiding.reason); }}>
            <p className="muted">La venta queda registrada como anulada y deja de sumar en la caja. Sólo se pueden anular ventas de la caja abierta.</p>
            <label>Motivo</label>
            <input className="input" autoFocus required value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} placeholder="Error de carga, cliente canceló…" />
            <div className="row end gap mt">
              <button type="button" className="btn ghost" onClick={() => setVoiding(null)}>Cancelar</button>
              <button className="btn danger">Anular</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
