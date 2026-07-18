import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const BACKEND = `http://localhost:${env.BACKEND_PORT || 6000}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api':       BACKEND,
        '/uploads':   BACKEND,
        '/socket.io': { target: BACKEND, ws: true },
      },
    },
  };
});
