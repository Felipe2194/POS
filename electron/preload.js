const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pos', {
  db: (method, args) => ipcRenderer.invoke('db', method, args),
  printers: () => ipcRenderer.invoke('printers'),
  printSale: (saleId, opts) => ipcRenderer.invoke('print:sale', saleId, opts),
  printClose: (sessionId, opts) => ipcRenderer.invoke('print:close', sessionId, opts),
  printTest: (settings, opts) => ipcRenderer.invoke('print:test', settings, opts),
  backupSave: () => ipcRenderer.invoke('backup:save'),
  backupOpenFolder: () => ipcRenderer.invoke('backup:openFolder'),
  exportCsv: (filename, csv) => ipcRenderer.invoke('export:csv', filename, csv),
});
