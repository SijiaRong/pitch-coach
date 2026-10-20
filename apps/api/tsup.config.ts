import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/parse-worker.ts',
    'src/refund-admin.ts',
    'src/payment-maintenance.ts',
  ],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // node:sqlite has no unprefixed alias; tsup otherwise rewrites it to "sqlite".
  removeNodeProtocol: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: ['@pitchcoach/shared'],
});
