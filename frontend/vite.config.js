import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default port is 5174, not Vite's usual 5173. On some Windows setups,
// binding to 0.0.0.0 (host: true) on a port in a range Windows has
// reserved (via `netsh interface ipv4 show excludedportrange`, often used
// by Hyper-V/WSL) fails with `EACCES: permission denied`, even for an
// unprivileged port number. Changing the port works around it; forcing
// host: true only when explicitly requested avoids the same class of
// problem recurring on a different port. Both are still configurable.
const PORT = Number(process.env.VITE_DEV_PORT) || 5174;
// Set VITE_DEV_EXPOSE_LAN=true to bind 0.0.0.0 (needed to test the mobile
// layout from a phone on the same network); defaults to localhost-only.
const EXPOSE_LAN = String(process.env.VITE_DEV_EXPOSE_LAN || 'false').toLowerCase() === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: false,
    host: EXPOSE_LAN ? true : 'localhost',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
