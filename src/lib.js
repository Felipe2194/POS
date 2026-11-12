import { createContext, useContext } from 'react';

export const api = window.pos;

export const money = (n) =>
  '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');

export const today = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const parseNum = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
  // admite "1.500,50", "1.234.567" (punto de miles) y "1500.50"
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '')
    : s;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

export const VERIFY_LABELS = { pendiente: 'Pendiente', verificado: 'Verificado', rechazado: 'Rechazado', no_aplica: '—' };

export function toCsv(rows, columns) {
  const escCell = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // separador ; para Excel en configuración regional es-AR
  return [columns.map((c) => c.label).join(';'), ...rows.map((r) => columns.map((c) => escCell(c.get(r))).join(';'))].join('\r\n');
}

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
