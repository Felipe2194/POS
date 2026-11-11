const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('pos', {
  setZoom: (factor) => webFrame.setZoomFactor(Math.min(1.6, Math.max(0.8, Number(factor) || 1))),
  db: (method, args) => ipcRenderer.invoke('db', method, args),
  printers: () => ipcRenderer.invoke('printers'),
  printSale: (saleId, opts) => ipcRenderer.invoke('print:sale', saleId, opts),
  printClose: (sessionId, opts) => ipcRenderer.invoke('print:close', sessionId, opts),
  printTest: (settings, opts) => ipcRenderer.invoke('print:test', settings, opts),
  printSample: (settings, kind, opts) => ipcRenderer.invoke('print:sample', settings, kind, opts),
  backupSave: () => ipcRenderer.invoke('backup:save'),
  backupOpenFolder: () => ipcRenderer.invoke('backup:openFolder'),
  exportCsv: (filename, csv) => ipcRenderer.invoke('export:csv', filename, csv),
});
