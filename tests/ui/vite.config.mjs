import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const mock = fileURLToPath(new URL('./mock-services.js', import.meta.url));
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: { alias: [
    { find: /^.*\/lib\/(programs|exerciseLibrary|catalogPrograms)\.js$/, replacement: mock },
  ] },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
