import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const mock = fileURLToPath(new URL('./workout-mock-services.js', import.meta.url));
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: { alias: [
    { find: /^.*\/lib\/(workoutSessions|workoutSessionExperience|exerciseEquipment|exerciseLibrary|supabase)\.js$/, replacement: mock },
  ] },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
