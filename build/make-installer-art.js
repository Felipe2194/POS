// Genera las imágenes del instalador (BMP 24 bits, lo que pide NSIS).
// Uso: npx electron build/make-installer-art.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const logo = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const BLUE = '#1d4ed8';
const ORANGE = '#ea580c';

const base = `*{margin:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;overflow:hidden}`;

// Barra lateral de las pantallas de bienvenida y final (164x314)
const sidebar = `<style>${base}
body{width:164px;height:314px;background:linear-gradient(170deg,${BLUE} 0%,#1e3a8a 100%);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:42px;position:relative}
.logo{width:92px;height:92px;filter:drop-shadow(0 6px 12px #0005)}
h1{font-size:23px;font-weight:800;margin-top:16px;letter-spacing:-.01em}
p{font-size:12px;opacity:.85;margin-top:4px;text-align:center;padding:0 12px;line-height:1.35}
.bar{position:absolute;bottom:0;left:0;right:0;height:10px;background:${ORANGE}}
.dots{position:absolute;bottom:26px;display:flex;gap:6px}.dots i{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.35}.dots i:first-child{opacity:.9}
</style><div class="logo">${logo}</div><h1>POS Comidas</h1><p>Ventas rápidas para<br>festivales y eventos</p>
<div class="dots"><i></i><i></i><i></i></div><div class="bar"></div>`;

// Encabezado de las pantallas intermedias (150x57)
const header = `<style>${base}
body{width:150px;height:57px;background:#fff;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-right:8px}
.logo{width:38px;height:38px}
b{font-size:15px;font-weight:800;color:#0f172a;line-height:1.05;text-align:right}b span{display:block;color:${ORANGE};font-size:12px;font-weight:700}
</style><b>POS<span>Comidas</span></b><div class="logo">${logo}</div>`;

function writeBmp(file, img) {
  const { width: w, height: h } = img.getSize();
  const bgra = img.toBitmap();
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = Buffer.alloc(size);
  buf.write('BM', 0); buf.writeUInt32LE(size, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(rowSize * h, 34);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * rowSize; // BMP va de abajo hacia arriba
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      buf[row + x * 3] = bgra[s]; buf[row + x * 3 + 1] = bgra[s + 1]; buf[row + x * 3 + 2] = bgra[s + 2];
    }
  }
  fs.writeFileSync(file, buf);
}

async function render(html, w, h, out) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = (await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h })).resize({ width: w, height: h });
  writeBmp(path.join(__dirname, out), img);
  if (process.env.PREVIEW_DIR) fs.writeFileSync(path.join(process.env.PREVIEW_DIR, out.replace('.bmp', '.png')), img.toPNG());
  win.destroy();
  console.log('ok', out);
}

app.on('window-all-closed', () => {}); // no salir entre una imagen y otra
app.whenReady().then(async () => {
  await render(sidebar, 164, 314, 'installerSidebar.bmp');
  await render(header, 150, 57, 'installerHeader.bmp');
  app.quit();
});
