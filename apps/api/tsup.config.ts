import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/parse-worker.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: ['@pitchcoach/shared'],
});
