import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDemoReport } from '@pitchcoach/shared';
import { PaymentStore } from '../src/payment-store';
import { paymentKey } from '../src/payment-codec';
import { backupPayments, restorePayments } from '../src/payment-backup';

const secret = 'storage-test-secret-'.repeat(3),
  owner = 'wx:storage-owner';
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function pathForTest() {
  const dir = mkdtempSync(join(tmpdir(), 'pitchcoach-storage-'));
  dirs.push(dir);
  return join(dir, 'ledger.sqlite');
}
function makeLegacy(path: string, corrupt = false) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE pay_users(owner TEXT PRIMARY KEY,openid TEXT NOT NULL);
    CREATE TABLE pay_orders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,status TEXT NOT NULL,prepay_id TEXT,transaction_id TEXT UNIQUE,
      created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,amount INTEGER NOT NULL DEFAULT 188 CHECK(amount=188),
      currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'),paid_at INTEGER,refund_id TEXT UNIQUE);
    CREATE INDEX pay_orders_owner ON pay_orders(owner,created_at);
    CREATE TABLE pay_evaluations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES pay_orders(id),status TEXT NOT NULL,report BLOB,expires_at INTEGER NOT NULL,
      UNIQUE(owner,request_key));`);
  db.prepare('INSERT INTO pay_users VALUES (?,?)').run(owner, 'private-wechat-openid');
  const orders = ['PC' + 'a'.repeat(30), 'PC' + 'b'.repeat(30), 'PC' + 'c'.repeat(30)];
  for (const [index, state] of ['paid', 'reserved', 'spent'].entries())
    db.prepare('INSERT INTO pay_orders VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      orders[index],
      owner,
      state,
      'old-prepay-token',
      `tx-${index}`,
      Date.now(),
      Date.now() + 600000,
      188,
      'CNY',
      Date.now(),
      null,
    );
  const interrupted = randomUUID(),
    completed = randomUUID(),
    requestKey = 'legacy-completed-request';
  db.prepare('INSERT INTO pay_evaluations VALUES (?,?,?,?,?,?,?)').run(
    interrupted,
    owner,
    'legacy-pending-request',
    orders[1],
    'pending',
    null,
    Date.now() + 600000,
  );
  const report = { ...createDemoReport(), projectName: '旧版私密评审内容' };
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', paymentKey(secret, 'report'), nonce);
  cipher.setAAD(Buffer.from(completed));
  const encrypted = Buffer.concat([
    nonce,
    cipher.update(JSON.stringify(report)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  if (corrupt) encrypted[20] ^= 1;
  db.prepare('INSERT INTO pay_evaluations VALUES (?,?,?,?,?,?,?)').run(
    completed,
    owner,
    requestKey,
    orders[2],
    'done',
    encrypted,
    Date.now() + 600000,
  );
  db.close();
  return { orders, interrupted, completed, report, requestKey };
}

describe('账本结构升级与存储控制', () => {
  it('拒绝错误密钥和跨商户复用账本，保留原余额', () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret),
      id = 'PC' + 'f'.repeat(30);
    store.register(owner, 'private-openid');
    store.createOrder(id, owner);
    store.markPaid(id, 'key-safety-tx');
    store.bindMerchant('wx-original', 'original-merchant');
    expect(() => store.bindMerchant('wx-original', 'another-merchant')).toThrow('another');
    store.close();
    expect(() => new PaymentStore(path, 'incorrect-secret-'.repeat(4))).toThrow();
    const reopened = new PaymentStore(path, secret);
    try {
      expect(reopened.creditCount(owner)).toBe(1);
      expect(reopened.openid(owner)).toBe('private-openid');
    } finally {
      reopened.close();
    }
  });
  it('旧账本完整升级，保留交易、幂等、报告与未使用额度，并加密OpenID', () => {
    const path = pathForTest(),
      old = makeLegacy(path);
    const store = new PaymentStore(path, secret);
    try {
      expect(store.statistics()).toMatchObject({
        schemaVersion: 2,
        orders: 3,
        evaluations: 2,
        users: 1,
      });
      expect(store.creditCount(owner)).toBe(1);
      expect(store.openid(owner)).toBe('private-wechat-openid');
      expect(store.order(old.orders[0]).prepay_id).toBeNull();
      expect(store.previous(owner, old.requestKey)).toBe(old.completed);
      expect(store.job(old.completed, owner)?.report).toEqual(old.report);
      store.recoverInterrupted();
      expect(store.creditCount(owner)).toBe(2);
      expect(store.order(old.orders[2]).status).toBe('spent');
    } finally {
      store.close();
    }
    const db = new DatabaseSync(path);
    try {
      const row = db.prepare('SELECT openid FROM pay_users').get()!;
      expect(typeof row.openid).not.toBe('string');
      expect(
        Buffer.from(row.openid as Uint8Array).includes(Buffer.from('private-wechat-openid')),
      ).toBe(false);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it('损坏报告导致升级失败时回滚，原始交易记录保持完整', () => {
    const path = pathForTest(),
      old = makeLegacy(path, true);
    expect(() => new PaymentStore(path, secret)).toThrow();
    const db = new DatabaseSync(path);
    try {
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM pay_orders').get()?.n).toBe(3);
      expect(
        db.prepare('SELECT status FROM pay_orders WHERE id=?').get(old.orders[2])?.status,
      ).toBe('spent');
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name='pay_orders_v1'").get(),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });
  it('报告先压缩再加密；清理只删除过期缓存，不删除账本和幂等记录', () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret),
      order = 'PC' + 'd'.repeat(30),
      id = randomUUID();
    try {
      store.register(owner, 'sensitive-openid');
      store.createOrder(order, owner);
      store.prepay(order, 'prepay-not-needed-after-paid');
      store.markPaid(order, 'tx-compressed');
      store.reserve(owner, id, 'retained-idempotency-key');
      const report = createDemoReport();
      store.complete(id, report);
      expect(store.job(id, owner)?.report).toEqual(report);
      expect(store.statistics().cachedReportBytes).toBeLessThan(
        Buffer.byteLength(JSON.stringify(report)) / 2,
      );
      expect(store.order(order).prepay_id).toBeNull();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60000);
      store.sweep(true);
      clock.mockRestore();
      expect(store.statistics()).toMatchObject({
        orders: 1,
        evaluations: 1,
        cachedReports: 0,
        cachedReportBytes: 0,
      });
      expect(store.previous(owner, 'retained-idempotency-key')).toBe(id);
      expect(store.order(order).status).toBe('spent');
    } finally {
      store.close();
    }
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
  it('新账本启用增量空间回收，WAL检查点与保留大小有限制', () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret);
    store.close();
    const db = new DatabaseSync(path);
    try {
      expect(db.prepare('PRAGMA auto_vacuum').get()?.auto_vacuum).toBe(2);
    } finally {
      db.close();
    }
  });
});

describe('一致性加密备份和恢复', () => {
  it('维护连接不会恢复仍在运行的评审额度', async () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret),
      order = 'PC' + '9'.repeat(30),
      id = randomUUID();
    try {
      store.createOrder(order, owner);
      store.markPaid(order, 'maintenance-reservation');
      store.reserve(owner, id, 'maintenance-pending-key');
      const maintenance = new PaymentStore(path, secret);
      try {
        maintenance.sweep(true);
        expect(maintenance.creditCount(owner)).toBe(0);
      } finally {
        maintenance.close();
      }
      expect(store.order(order).status).toBe('reserved');
      expect(store.job(id, owner)?.status).toBe('running');
    } finally {
      store.close();
    }
  });
  it('在线备份包含已提交的WAL交易，恢复后余额正确且不覆盖已有文件', async () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret),
      order = 'PC' + 'e'.repeat(30);
    try {
      store.register(owner, 'backup-private-openid');
      store.createOrder(order, owner);
      store.markPaid(order, 'tx-backup');
      const directory = join(path, '..', 'backups');
      const snapshot = await backupPayments(path, secret, directory);
      expect(statSync(snapshot).mode & 0o777).toBe(0o600);
      expect(readFileSync(snapshot).includes(Buffer.from('backup-private-openid'))).toBe(false);
      const restored = join(path, '..', 'restored.sqlite');
      await restorePayments(snapshot, secret, restored);
      const copy = new PaymentStore(restored, secret);
      try {
        expect(copy.creditCount(owner)).toBe(1);
        expect(copy.openid(owner)).toBe('backup-private-openid');
      } finally {
        copy.close();
      }
      const before = readFileSync(restored);
      await expect(restorePayments(snapshot, secret, restored)).rejects.toThrow();
      expect(readFileSync(restored)).toEqual(before);
    } finally {
      store.close();
    }
  });
  it('拒绝错误密钥和篡改的备份；失败恢复不会遗留可用输出', async () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret);
    store.close();
    const directory = join(path, '..', 'backups'),
      snapshot = await backupPayments(path, secret, directory);
    const target = join(path, '..', 'should-not-exist.sqlite');
    await expect(restorePayments(snapshot, 'wrong-secret-'.repeat(4), target)).rejects.toThrow();
    const bytes = readFileSync(snapshot);
    bytes[20] ^= 1;
    writeFileSync(snapshot, bytes);
    await expect(restorePayments(snapshot, secret, target)).rejects.toThrow();
    expect(
      readdirSync(join(path, '..')).some(
        (name) => name === 'should-not-exist.sqlite' || name.startsWith('.restore-'),
      ),
    ).toBe(false);
  });
  it('备份数量有上限，只清理本功能生成的旧备份', async () => {
    const path = pathForTest(),
      store = new PaymentStore(path, secret);
    store.close();
    const directory = join(path, '..', 'backups');
    for (let index = 0; index < 5; index++) {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1800000000000 + index * 1000);
      await backupPayments(path, secret, directory, 3);
      clock.mockRestore();
    }
    expect(readdirSync(directory).filter((name) => name.endsWith('.enc'))).toHaveLength(3);
    expect(
      readdirSync(directory).some(
        (name) => name.startsWith('.snapshot-') || name.endsWith('.partial'),
      ),
    ).toBe(false);
  });
});
