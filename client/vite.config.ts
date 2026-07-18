import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const BACKEND = `http://localhost:${env.BACKEND_PORT || 6000}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api':        { target: BACKEND, changeOrigin: true },
        '/uploads':    { target: BACKEND, changeOrigin: true },
        '/socket.io':  { target: BACKEND, changeOrigin: true, ws: true },
        '/doodlegen':  { target: 'http://localhost:3000', changeOrigin: true,
                         rewrite: (p) => p.replace(/^\/doodlegen/, '') },
      },
    },
  };
});
