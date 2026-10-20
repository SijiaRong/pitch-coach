import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCipheriv, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoReport, DEFAULT_PREFERENCES, EXAMPLES } from '@pitchcoach/shared';
import type { Submission } from '@pitchcoach/shared';
import { PaymentStore } from '../src/payment-store';
import { WechatPay } from '../src/wechat-pay';
import type { PaidTransaction, PaymentGateway } from '../src/wechat-pay';
import { loadConfig } from '../src/config';
import { Billing } from '../src/billing';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { EvaluationJobs } from '../src/jobs';

const dirs: string[] = [];
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const secret = 'test-only-'.repeat(5);
const config = loadConfig({
  NODE_ENV: 'test',
  SESSION_SECRET: secret,
  WECHAT_APP_ID: 'wx-test',
  WECHAT_APP_SECRET: 'test-secret',
  WECHAT_PAY_MCH_ID: '1234567890',
  PAY_SUPPORT_CONTACT: 'test@example.com',
});
const owner = 'wx:alice';
const orderId = () => `PC${randomUUID().replaceAll('-', '').slice(0, 30)}`;
const paid = (id: string): PaidTransaction => ({
  appid: 'wx-test',
  mchid: '1234567890',
  out_trade_no: id,
  transaction_id: `wx-${id}`,
  trade_type: 'JSAPI',
  trade_state: 'SUCCESS',
  payer: { openid: 'alice-openid' },
  amount: { total: 188, currency: 'CNY' },
});
const input: Submission = {
  projectName: '商业秘密不应明文落盘',
  industry: 'ai',
  round: 'angel',
  preferences: [...DEFAULT_PREFERENCES],
  stage: '已有收入',
  description: EXAMPLES.ai.description,
  bpText: '',
  consent: true,
  tone: 'sharp',
};
function store(path = ':memory:') {
  const db = new PaymentStore(path, secret);
  return db;
}
function setup() {
  const db = store();
  db.register(owner, 'alice-openid');
  const gateway: PaymentGateway = {
    prepay: vi.fn(async () => 'prepay-test'),
    params: () => ({
      timeStamp: '1',
      nonceStr: 'nonce',
      package: 'prepay_id=test',
      signType: 'RSA',
      paySign: 'test',
    }),
    query: vi.fn(async () => undefined),
    notification: (raw) => JSON.parse(raw.toString()),
  };
  return { db, gateway, billing: new Billing(config, db, gateway) };
}
function credit(db: PaymentStore, id = orderId()) {
  db.createOrder(id, owner);
  db.markPaid(id, `wx-${id}`);
  return id;
}

describe('支付账本和订单隔离', () => {
  it('支付通知丢失时主动查单补记额度，并合并并发查单', async () => {
    const { db, gateway, billing } = setup();
    cleanup.push(() => billing.close());
    const order = await billing.createOrder(owner);
    gateway.query = vi.fn(async () => paid(order.orderId));
    await Promise.all([billing.refresh(order.orderId, owner), billing.refresh(order.orderId, owner)]);
    expect(gateway.query).toHaveBeenCalledTimes(1);
    expect(db.creditCount(owner)).toBe(1);
  });
  it('重复通知只入账一次，已消费和退款的订单不会被通知复活', () => {
    const db = store();
    cleanup.push(() => db.close());
    const id = credit(db);
    db.markPaid(id, `wx-${id}`);
    expect(db.creditCount(owner)).toBe(1);
    const job = randomUUID();
    db.reserve(owner, job, 'request-unique-001');
    expect(() => db.reserve(owner, randomUUID(), 'another-request')).toThrow('支付');
    db.complete(job, createDemoReport());
    db.markPaid(id, `wx-${id}`);
    expect(db.creditCount(owner)).toBe(0);
    const refundable = credit(db);
    db.refund(refundable, 'hold');
    expect(db.creditCount(owner)).toBe(0);
    db.refund(refundable, 'confirm', 'wechat-refund-test-id');
    db.markPaid(refundable, `wx-${refundable}`);
    expect(db.order(refundable).status).toBe('refunded');
    expect(() => db.refund(id, 'hold')).toThrow();
  });
  it('重启恢复未完成额度；已完成报告加密落盘、可领取并按时清理', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pitchcoach-pay-'));
    dirs.push(dir);
    const path = join(dir, 'pay.sqlite');
    let db = store(path);
    const id = credit(db);
    const interrupted = randomUUID();
    db.reserve(owner, interrupted, 'interrupted-key');
    db.close();
    db = store(path);
    db.recoverInterrupted();
    expect(db.creditCount(owner)).toBe(1);
    expect(db.job(interrupted, owner)?.error?.code).toBe('CREDIT_RESTORED');
    const completed = randomUUID();
    db.reserve(owner, completed, 'completed-key');
    const report = { ...createDemoReport(), projectName: '绝密融资资料不应明文落盘' };
    db.complete(completed, report);
    db.close();
    expect(readFileSync(path).includes(Buffer.from(report.projectName))).toBe(false);
    db = store(path);
    cleanup.push(() => db.close());
    db.recoverInterrupted();
    expect(db.creditCount(owner)).toBe(0);
    expect(db.order(id).status).toBe('spent');
    expect(db.job(completed, owner)?.report?.projectName).toBe(report.projectName);
    expect(db.job(completed, 'other-user')).toBeUndefined();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
    db.sweep();
    expect(db.job(completed, owner)).toBeUndefined();
    clock.mockRestore();
  });
  it('并发创建支付订单复用同一预支付单，拒绝重复付款及跨用户查单', async () => {
    const { db, gateway, billing } = setup();
    cleanup.push(() => billing.close());
    const [a, b] = await Promise.all([billing.createOrder(owner), billing.createOrder(owner)]);
    expect(a.orderId).toBe(b.orderId);
    expect(gateway.prepay).toHaveBeenCalledTimes(1);
    expect(() => db.order(a.orderId, 'mallory')).toThrow('不存在');
    billing.notification(Buffer.from(JSON.stringify(paid(a.orderId))), {});
    billing.notification(Buffer.from(JSON.stringify(paid(a.orderId))), {});
    expect(db.creditCount(owner)).toBe(1);
    await expect(billing.createOrder(owner)).rejects.toMatchObject({ code: 'CREDIT_AVAILABLE' });
  });
  it('通知校验金额、币种、商户、小程序和付款人；未支付不会获得额度', async () => {
    const { db, billing } = setup();
    cleanup.push(() => billing.close());
    const id = db.createOrder(orderId(), owner).id;
    for (const patch of [
      { amount: { total: 1, currency: 'CNY' } },
      { amount: { total: 188, currency: 'USD' } },
      { mchid: 'other' },
      { appid: 'other' },
      { payer: { openid: 'mallory' } },
      { trade_state: 'NOTPAY' },
    ]) {
      expect(() =>
        billing.notification(Buffer.from(JSON.stringify({ ...paid(id), ...patch })), {}),
      ).toThrow();
      expect(db.creditCount(owner)).toBe(0);
    }
    await billing.refresh(id, owner);
    expect(db.creditCount(owner)).toBe(0);
  });
  it('支付开启时不能绕过评估接口，客户端不能指定金额，回调保留原始报文', async () => {
    const { db, billing } = setup();
    const app = await createApp(config, {
      billing,
      reviewer: async () => {
        throw new Error('not called');
      },
    });
    cleanup.push(() => app.close());
    const headers = {
      authorization: `Bearer ${issueToken(owner, config)}`,
      'idempotency-key': 'request-valid-001',
    };
    const noPay = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: input,
      headers,
    });
    expect(noPay.statusCode).toBe(402);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/billing/orders',
          payload: { amount: 1 },
          headers,
        })
      ).statusCode,
    ).toBe(400);
    const id = db.createOrder(orderId(), owner).id;
    const raw = JSON.stringify(paid(id), null, 2);
    const notify = await app.inject({
      method: 'POST',
      url: '/api/payments/wechat/notify',
      headers: { 'content-type': 'application/json' },
      payload: raw,
    });
    expect(notify.statusCode).toBe(204);
    expect(db.creditCount(owner)).toBe(1);
    const denied = await app.inject({
      url: `/api/billing/orders/${id}`,
      headers: { authorization: `Bearer ${issueToken('other', config)}` },
    });
    expect(denied.statusCode).toBe(404);
  });
  it('提交重试仅扣一次；取消和全部失败恢复；部分成功则消费一次', async () => {
    const db = store();
    cleanup.push(() => db.close());
    credit(db);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobs = new EvaluationJobs(
      config,
      async () => {
        await waiting;
        throw new Error('failure');
      },
      db,
    );
    const a = jobs.create(owner, input, 'same-request-key');
    expect(jobs.create(owner, input, 'same-request-key').id).toBe(a.id);
    expect(db.creditCount(owner)).toBe(0);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.creditCount(owner)).toBe(1);
    const canceled = new EvaluationJobs(config, async () => new Promise(() => {}), db);
    const b = canceled.create(owner, input, 'cancel-key-unique');
    canceled.remove(b.id, owner);
    canceled.close();
    expect(db.creditCount(owner)).toBe(1);
    jobs.close();
    const partial = new EvaluationJobs(
      config,
      async (_submission, investor) => {
        if (investor.preference !== 'technology') throw new Error('unavailable');
        return { content: createDemoReport().investors[0], model: 'test-only' };
      },
      db,
    );
    const completed = partial.create(owner, input, 'partial-result-key');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(partial.get(completed.id, owner).status).toBe('done');
    expect(db.creditCount(owner)).toBe(0);
    partial.remove(completed.id, owner);
    expect(db.creditCount(owner)).toBe(0);
    partial.close();
  });
});

const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 });
const platform = generateKeyPairSync('rsa', { modulusLength: 2048 });
function cryptoSetup() {
  const dir = mkdtempSync(join(tmpdir(), 'pitchcoach-crypto-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'private.pem'),
    merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  writeFileSync(
    join(dir, 'public.pem'),
    platform.publicKey.export({ type: 'spki', format: 'pem' }),
  );
  const value = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: secret,
    WECHAT_APP_ID: 'wx-test',
    WECHAT_APP_SECRET: 'test',
    PAYMENTS_ENABLED: 'true',
    PAYMENT_DB_PATH: ':memory:',
    WECHAT_PAY_MCH_ID: '1234567890',
    WECHAT_PAY_SERIAL_NO: 'ABCDEF',
    WECHAT_PAY_PRIVATE_KEY_PATH: join(dir, 'private.pem'),
    WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_test',
    WECHAT_PAY_PUBLIC_KEY_PATH: join(dir, 'public.pem'),
    WECHAT_PAY_API_V3_KEY: 'v'.repeat(32),
    WECHAT_PAY_NOTIFY_URL: 'https://example.com/api/payments/wechat/notify',
    PAY_SUPPORT_CONTACT: 'test@example.com',
  });
  return value;
}
function signedHeaders(raw: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const nonce = 'notification-nonce';
  return {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-serial': 'PUB_KEY_ID_test',
    'wechatpay-signature': sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
      platform.privateKey,
    ).toString('base64'),
  };
}
function encryptedNotification(config: ReturnType<typeof loadConfig>, transaction: unknown) {
  const nonce = '123456789012';
  const associated_data = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.WECHAT_PAY_API_V3_KEY), nonce);
  cipher.setAAD(Buffer.from(associated_data));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(transaction)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return JSON.stringify({
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      original_type: 'transaction',
      nonce,
      associated_data,
      ciphertext: encrypted.toString('base64'),
    },
  });
}

describe('微信支付 V3 协议安全', () => {
  it('按官方格式签署下单和小程序支付参数，固定金额188分，并验证应答签名', async () => {
    const config = cryptoSetup();
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi');
      const body = String(options?.body);
      const data = JSON.parse(body);
      expect(data.amount).toEqual({ total: 188, currency: 'CNY' });
      expect(data.payer.openid).toBe('alice-openid');
      const auth = new Headers(options?.headers).get('authorization')!;
      const fields = Object.fromEntries(
        [...auth.matchAll(/(\w+)="([^"]+)"/g)].map((m) => [m[1], m[2]]),
      );
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(
            `POST\n/v3/pay/transactions/jsapi\n${fields.timestamp}\n${fields.nonce_str}\n${body}\n`,
          ),
          merchant.publicKey,
          Buffer.from(fields.signature, 'base64'),
        ),
      ).toBe(true);
      const raw = JSON.stringify({ prepay_id: 'wx-prepay' });
      return new Response(raw, { headers: signedHeaders(raw) });
    });
    const gateway = new WechatPay(config, fetcher);
    expect(await gateway.prepay(orderId(), 'alice-openid', Date.now() + 900000)).toBe('wx-prepay');
    const p = gateway.params('wx-prepay');
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`wx-test\n${p.timeStamp}\n${p.nonceStr}\n${p.package}\n`),
        merchant.publicKey,
        Buffer.from(p.paySign, 'base64'),
      ),
    ).toBe(true);
  });
  it('验签后才解密；拒绝篡改、过期通知、未知公钥和错误金额', () => {
    const config = cryptoSetup();
    const gateway = new WechatPay(config);
    const raw = encryptedNotification(config, paid(orderId()));
    expect(gateway.notification(Buffer.from(raw), signedHeaders(raw)).amount.total).toBe(188);
    expect(() => gateway.notification(Buffer.from(raw + ' '), signedHeaders(raw))).toThrow('验签');
    expect(() =>
      gateway.notification(
        Buffer.from(raw),
        signedHeaders(raw, String(Math.floor(Date.now() / 1000) - 301)),
      ),
    ).toThrow('验签');
    expect(() =>
      gateway.notification(Buffer.from(raw), {
        ...signedHeaders(raw),
        'wechatpay-serial': 'PUB_KEY_ID_unknown',
      }),
    ).toThrow('验签');
    const wrong = encryptedNotification(config, {
      ...paid(orderId()),
      amount: { total: 1, currency: 'CNY' },
    });
    expect(() => gateway.notification(Buffer.from(wrong), signedHeaders(wrong))).toThrow('校验');
  });
  it('不接受伪造的微信 API 应答', async () => {
    const config = cryptoSetup();
    const gateway = new WechatPay(
      config,
      (async () => new Response('{"prepay_id":"forged"}')) as typeof fetch,
    );
    await expect(
      gateway.prepay(orderId(), 'alice-openid', Date.now() + 900000),
    ).rejects.toMatchObject({ code: 'PAYMENT_INVALID_RESPONSE' });
  });
});
