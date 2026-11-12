import { useEffect } from 'react';

export function Modal({ title, children, onClose, small, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal ' + (small ? 'small ' : '') + (wide ? 'wide' : '')}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn icon ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, tone, sub }) {
  return (
    <div className={'stat ' + (tone || '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }) {
  const map = { pendiente: 'warn', verificado: 'ok', rechazado: 'bad', ok: 'ok', anulada: 'bad', rechazada: 'bad', abierta: 'ok', cerrada: 'muted' };
  const label = { pendiente: 'Pendiente', verificado: 'Verificado', rechazado: 'No llegó', ok: 'Cobrada', anulada: 'Anulada', rechazada: 'Pago no recibido', abierta: 'Abierta', cerrada: 'Cerrada', no_aplica: '—' };
  return <span className={'pill ' + (map[status] || 'muted')}>{label[status] || status}</span>;
}
