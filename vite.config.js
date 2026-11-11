import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // rutas relativas para cargar desde file:// en Electron
  server: { port: 5173, strictPort: true },
});
