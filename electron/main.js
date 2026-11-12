const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const printer = require('./print');
const updater = require('./updater');

const isDev = !!process.env.VITE_DEV;
let win;

// Una sola instancia (evita dos cajas escribiendo a la vez)
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  // Se crea oculta y ya del tamaño de la pantalla: así no se ve una ventana recortada
  // que después se agranda. Se muestra cuando la app avisa que terminó de dibujarse.
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width,
    height,
    show: false,
    minWidth: 1024,
    minHeight: 640,
    title: 'POS Comidas',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  let shown = false;
  const reveal = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.maximize();
    win.show();
    win.focus();
  };
  ipcMain.once('app:ready', reveal);
  setTimeout(reveal, 6000); // por las dudas, nunca queda invisible
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  db.init(userData);
  try { await db.autoBackup(userData); } catch (e) { console.error('Backup automático falló', e); }

  // API genérica de datos: window.pos.db('metodo', args)
  ipcMain.handle('db', async (_e, method, args) => {
    const fn = db.api[method];
    if (!fn) throw new Error('Método inexistente: ' + method);
    return fn(args);
  });

  ipcMain.handle('printers', async () => {
    const list = await win.webContents.getPrintersAsync();
    return list.map((p) => ({ name: p.name, isDefault: p.isDefault }));
  });

  // Cola de impresión: los trabajos salen de a uno y en orden, aunque se registren
  // varias ventas seguidas. La venta nunca espera a la impresora.
  let printQueue = Promise.resolve();
  const enqueue = (job) => {
    const p = printQueue.then(job, job);
    printQueue = p.catch(() => {});
    return p;
  };

  ipcMain.handle('print:sale', async (_e, saleId, opts = {}) => {
    const settings = db.api.getSettings();
    const sale = db.api.getSale(saleId);
    // Sin ticketera configurada no se abre la vista previa en cada venta (frenaría la caja).
    if (!settings.printer_name && !opts.preview) {
      return { ok: false, error: 'no hay ticketera configurada en Configuración' };
    }
    return enqueue(() => printer.printSale(sale, settings, {
      ticket: opts.ticket ?? settings.print_ticket === '1',
      comanda: opts.comanda ?? settings.print_comanda === '1',
      preview: !!opts.preview,
    })).catch((e) => ({ ok: false, error: e.message }));
  });

  ipcMain.handle('print:close', async (_e, sessionId, opts = {}) => {
    const settings = db.api.getSettings();
    return printer.printClose(db.api.sessionSummary(sessionId), settings, { preview: !!opts.preview || !settings.printer_name });
  });

  ipcMain.handle('print:test', async (_e, partialSettings, opts = {}) => {
    const settings = { ...db.api.getSettings(), ...partialSettings };
    return printer.printTest(settings, { preview: !!opts.preview || !settings.printer_name });
  });

  ipcMain.handle('print:sample', async (_e, partialSettings, kind, opts = {}) => {
    const settings = { ...db.api.getSettings(), ...partialSettings };
    const preview = !!opts.preview || !settings.printer_name;
    return preview ? printer.printSample(settings, kind, { preview }) : enqueue(() => printer.printSample(settings, kind, {}));
  });

  ipcMain.handle('backup:save', async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Guardar copia de seguridad',
      defaultPath: `pos-backup-${stamp}.sqlite`,
      filters: [{ name: 'Base de datos', extensions: ['sqlite'] }],
    });
    if (canceled || !filePath) return null;
    await db.backupTo(filePath);
    return filePath;
  });

  ipcMain.handle('backup:openFolder', async () => {
    const dir = path.join(userData, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('export:csv', async (_e, filename, csv) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, '﻿' + csv, 'utf8'); // BOM para que Excel respete acentos
    return filePath;
  });

  createWindow();

  // Antes de instalar una actualización se guarda una copia de la base, por las dudas.
  // (el nombre empieza con pos-fecha para que la limpieza de "últimas 30" la ordene por fecha)
  updater.setup({
    win: () => win,
    onBeforeInstall: async () => {
      const dir = path.join(userData, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      await db.backupTo(path.join(dir, `pos-${stamp}-antes-de-actualizar-v${app.getVersion()}.sqlite`));
    },
  });
});

app.on('window-all-closed', () => app.quit());
