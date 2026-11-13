import { createContext, useContext } from 'react';

export const api = window.pos;

export const money = (n) =>
  '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Fechas siempre día/mes/año y hora de 24 hs, armadas a mano para no depender del idioma de Windows.
const z2 = (n) => String(n).padStart(2, '0');
export const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${z2(d.getHours())}:${z2(d.getMinutes())}`;
};
export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${z2(d.getDate())}/${z2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '');

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

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
