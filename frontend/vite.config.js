import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    build: {
      // Cloudflare Pages serves whatever is in this directory as static assets.
      outDir: 'dist',
      emptyOutDir: true,
      // Pages sets long-lived cache headers on hashed filenames; keep the hash.
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      target: 'es2020',
      // Pages rejects individual files over 25 MiB; nowhere near it, but keep
      // the bundle split so a config change does not bust the vendor chunk.
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom'] },
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },

    server: {
      port: 5173,
      // Dev-only: lets the browser call /api without CORS while you work locally.
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },

    preview: { port: 4173 },
  };
});
