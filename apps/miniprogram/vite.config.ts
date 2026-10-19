import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pitchcoach/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  optimizeDeps: { exclude: ['@pitchcoach/shared'] },
  server: { proxy: { '/api': process.env.PITCHCOACH_DEV_API_TARGET || 'http://127.0.0.1:8787' } },
});
