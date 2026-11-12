// Actualizaciones automáticas desde GitHub Releases (repo público solo con instaladores).
// Flujo: se busca al arrancar y cada 4 horas; si hay versión nueva se descarga en segundo
// plano sin molestar. Recién cuando está lista se le PREGUNTA al usuario si instalar ahora.
// Si dice "más tarde" no se instala nada: queda el aviso en el menú y se vuelve a preguntar
// en el próximo arranque. Nunca se instala sin consentimiento (ni siquiera al cerrar).
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let state = { status: 'idle', version: null, percent: 0, error: null };
let getWin = () => null;
let beforeInstall = async () => {};

function emit(patch) {
  state = { ...state, ...patch };
  const win = getWin();
  if (win && !win.isDestroyed()) win.webContents.send('update:state', state);
}

function check() {
  if (!app.isPackaged) return Promise.resolve(emit({ status: 'dev' }));
  if (['downloading', 'ready'].includes(state.status)) return Promise.resolve();
  return autoUpdater.checkForUpdates().catch((e) => emit({ status: 'error', error: e.message }));
}

function setup({ win, onBeforeInstall }) {
  getWin = win;
  if (onBeforeInstall) beforeInstall = onBeforeInstall;

  autoUpdater.autoDownload = true;          // descargar sí (en segundo plano)
  autoUpdater.autoInstallOnAppQuit = false; // instalar solo si el usuario lo acepta

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => emit({ status: 'none' }));
  autoUpdater.on('update-available', (i) => emit({ status: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => emit({ status: 'ready', version: i.version, percent: 100 }));
  // Sin internet es lo normal en un evento: se registra pero no se muestra como problema.
  autoUpdater.on('error', (e) => emit({ status: 'error', error: e?.message || String(e) }));

  ipcMain.handle('update:get', () => ({ ...state, current: app.getVersion() }));
  ipcMain.handle('update:check', async () => { await check(); return state; });
  ipcMain.handle('update:install', async () => {
    if (state.status !== 'ready') return false;
    try { await beforeInstall(); } catch (e) { console.error('Backup previo a actualizar falló', e); }
    // silencioso: reinstala en la misma carpeta sin mostrar el asistente y vuelve a abrir la app
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });

  setTimeout(check, 15000); // deja arrancar tranquila la caja primero
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { setup };
