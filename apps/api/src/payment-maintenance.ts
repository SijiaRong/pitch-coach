import { dirname, join, resolve } from 'node:path';
import { PaymentStore } from './payment-store';
import { backupPayments, restorePayments } from './payment-backup';
const [action = 'backup', source, target] = process.argv.slice(2);
const path = process.env.PAYMENT_DB_PATH;
const secret = process.env.SESSION_SECRET;
if (
  !path ||
  !secret ||
  secret.length < 32 ||
  !['init', 'stats', 'backup', 'restore'].includes(action)
) {
  console.error(
    'Set PAYMENT_DB_PATH and stable SESSION_SECRET. Usage: payment-maintenance.js init|stats|backup|restore BACKUP NEW_TARGET',
  );
  process.exit(1);
}
if (action === 'restore') {
  if (!source || !target || resolve(target) === resolve(path))
    throw new Error('Restore requires a backup and a NEW target, never the live ledger');
  await restorePayments(source, secret, target);
  console.log('Payment backup restored and checked into a new file; live ledger was not replaced.');
} else {
  const store = new PaymentStore(path, secret);
  try {
    store.sweep(true);
    if (action === 'backup') {
      await backupPayments(path, secret, join(dirname(path), 'backups'), 3);
      console.log('Encrypted ledger backup completed; retained at most 3 snapshots.');
    }
    console.log(JSON.stringify(store.statistics()));
  } finally {
    store.close();
  }
}
