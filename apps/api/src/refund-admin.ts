// This command changes local entitlement state only. It never transfers money.
import { PaymentStore } from './payment-store';
import { existsSync } from 'node:fs';
const [action, orderId, refundId] = process.argv.slice(2);
if (
  !['hold', 'confirm', 'release'].includes(action) ||
  !/^PC[a-f0-9]{30}$/.test(orderId || '') ||
  (action === 'confirm' && !/^[A-Za-z0-9_-]{6,80}$/.test(refundId || ''))
) {
  console.error(
    'Usage: refund-admin.js hold|release ORDER_ID OR confirm ORDER_ID WECHAT_REFUND_ID',
  );
  process.exit(1);
}
if (
  !process.env.PAYMENT_DB_PATH ||
  !process.env.SESSION_SECRET ||
  !existsSync(process.env.PAYMENT_DB_PATH)
) {
  console.error('Set PAYMENT_DB_PATH and SESSION_SECRET using the protected env file');
  process.exit(1);
}
const store = new PaymentStore(process.env.PAYMENT_DB_PATH, process.env.SESSION_SECRET);
try {
  store.refund(orderId, action as 'hold' | 'confirm' | 'release', refundId);
  console.log(
    `Order ${orderId}: ${store.order(orderId).status}. No money was transferred by this command.`,
  );
} finally {
  store.close();
}
