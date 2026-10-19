// Exercise the built executable, including Node-only builtins, with synthetic data.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = mkdtempSync(join(tmpdir(), 'pitchcoach-runtime-'));
const binary = fileURLToPath(new URL('../dist/payment-maintenance.js', import.meta.url));
const env = {
  PATH: process.env.PATH || '',
  PAYMENT_DB_PATH: join(directory, 'ledger.sqlite'),
  SESSION_SECRET: randomBytes(32).toString('hex'),
};
function run(...args) {
  const result = spawnSync(process.execPath, [binary, ...args], { env, encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`Built API runtime check failed: ${result.stderr || result.error || result.status}`);
}
try {
  run('init');
  run('backup');
  const snapshot = readdirSync(join(directory, 'backups')).find((name) => name.endsWith('.enc'));
  if (!snapshot) throw new Error('Built runtime did not produce an encrypted backup');
  run('restore', join(directory, 'backups', snapshot), join(directory, 'restored.sqlite'));
  console.log('API production runtime smoke test passed (init, backup, restore).');
} finally { rmSync(directory, { recursive: true, force: true }); }
