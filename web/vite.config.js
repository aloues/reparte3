import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './': los recursos se piden con rutas relativas, así funciona en GitHub Pages
// sin importar el nombre del repositorio (la navegación usa #/rutas).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
