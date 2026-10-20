const required = ['WECHAT_APP_SECRET', 'SESSION_SECRET', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'];
if (process.env.PAYMENTS_ENABLED === 'true') required.push('WECHAT_PAY_MCH_ID', 'WECHAT_PAY_SERIAL_NO',
  'WECHAT_PAY_PRIVATE_KEY_PATH', 'WECHAT_PAY_PUBLIC_KEY_ID', 'WECHAT_PAY_PUBLIC_KEY_PATH',
  'WECHAT_PAY_API_V3_KEY', 'WECHAT_PAY_NOTIFY_URL', 'PAYMENT_DB_PATH', 'PAY_SUPPORT_CONTACT');
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`AI投了么 remains stopped; configure: ${missing.join(', ')}`);
  process.exit(1);
}
if (!process.env.AI_BASE_URL.startsWith('https://')) {
  console.error('AI投了么 remains stopped: AI_BASE_URL must use HTTPS');
  process.exit(1);
}
