import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EvaluationReport, JobStatus } from '@pitchcoach/shared';
import { PublicError } from './errors';
import { initializePaymentSchema, ORDER_STATES, requestHash } from './payment-schema';
import { packReport, paymentKey, seal, unpackReport, unseal } from './payment-codec';

export interface PayOrder {
  id: string;
  owner: string;
  status: string;
  prepay_id: string | null;
  transaction_id: string | null;
  created_at: number;
  expires_at: number;
}
const USER = '(SELECT id FROM pay_users WHERE owner=?)';
const ORDER_SELECT = `SELECT o.trade_no AS id,u.owner,o.state,o.prepay_id,o.transaction_id,o.created_at,o.expires_at
  FROM pay_orders o JOIN pay_users u ON u.id=o.user_id`;
type OrderRow = Omit<PayOrder, 'status'> & { state: number };
const publicOrder = (row: OrderRow): PayOrder => {
  const { state, ...order } = row;
  return { ...order, status: ORDER_STATES[state] };
};

export class PaymentStore {
  private db: DatabaseSync;
  private key: Buffer;
  private identityKey: Buffer;
  private lastSweep = -Infinity;
  constructor(path: string, secret: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.key = paymentKey(secret, 'report');
    this.identityKey = paymentKey(secret, 'identity');
    try {
      // Set the file format before WAL creates the first database page.
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      if (tables.length && !tables.some((table) => table.name === 'pay_orders'))
        throw new Error('Refusing to modify an unrecognized payment database');
      if (!tables.length) this.db.exec('PRAGMA auto_vacuum=INCREMENTAL');
      if (path !== ':memory:') chmodSync(path, 0o600);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
        PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=1048576;`);
      initializePaymentSchema(this.db, this.key, this.identityKey);
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS pay_metadata(key TEXT PRIMARY KEY,value BLOB NOT NULL) WITHOUT ROWID',
      );
      this.tx(() => {
        const check = this.db
          .prepare("SELECT value FROM pay_metadata WHERE key='key_check'")
          .get() as { value: Uint8Array } | undefined;
        if (check) {
          if (
            unseal(check.value, this.identityKey, 'ledger-key-check').toString() !==
            'pitchcoach-ledger-v2'
          )
            throw new Error('Payment ledger encryption key mismatch');
        } else
          this.db
            .prepare("INSERT INTO pay_metadata VALUES ('key_check',?)")
            .run(seal(Buffer.from('pitchcoach-ledger-v2'), this.identityKey, 'ledger-key-check'));
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  bindMerchant(appid: string, mchid: string) {
    if (!appid || !mchid) throw new Error('Payment ledger requires an AppID and merchant ID');
    const scope = Buffer.from(JSON.stringify([appid, mchid]));
    this.tx(() => {
      const row = this.db.prepare("SELECT value FROM pay_metadata WHERE key='merchant'").get() as
        | { value: Uint8Array }
        | undefined;
      if (row && !Buffer.from(row.value).equals(scope))
        throw new Error('Payment ledger belongs to another AppID or merchant');
      if (!row) this.db.prepare("INSERT INTO pay_metadata VALUES ('merchant',?)").run(scope);
    });
  }
  statistics() {
    const scalar = (sql: string) => Number(Object.values(this.db.prepare(sql).get()!)[0]);
    return {
      schemaVersion: scalar('PRAGMA user_version'),
      databaseBytes: scalar('PRAGMA page_count') * scalar('PRAGMA page_size'),
      reusableBytes: scalar('PRAGMA freelist_count') * scalar('PRAGMA page_size'),
      users: scalar('SELECT COUNT(*) FROM pay_users'),
      orders: scalar('SELECT COUNT(*) FROM pay_orders'),
      evaluations: scalar('SELECT COUNT(*) FROM pay_evaluations'),
      cachedReports: scalar('SELECT COUNT(*) FROM pay_report_cache'),
      cachedReportBytes: scalar('SELECT COALESCE(SUM(length(report)),0) FROM pay_report_cache'),
    };
  }
  register(owner: string, openid: string) {
    const row = this.db.prepare('SELECT openid FROM pay_users WHERE owner=?').get(owner) as
      | { openid: Uint8Array | null }
      | undefined;
    if (row?.openid && unseal(row.openid, this.identityKey, owner).toString() === openid) return;
    this.db
      .prepare(
        'INSERT INTO pay_users(owner,openid) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET openid=excluded.openid',
      )
      .run(owner, seal(Buffer.from(openid), this.identityKey, owner));
  }
  openid(owner: string): string {
    const row = this.db.prepare('SELECT openid FROM pay_users WHERE owner=?').get(owner) as
      | { openid: Uint8Array | null }
      | undefined;
    if (!row?.openid) throw new PublicError(401, 'WECHAT_LOGIN_REQUIRED', '请重新登录微信后支付');
    return unseal(row.openid, this.identityKey, owner).toString();
  }
  order(id: string, owner?: string): PayOrder {
    const row = this.db.prepare(`${ORDER_SELECT} WHERE o.trade_no=?`).get(id) as
      | OrderRow
      | undefined;
    if (!row || (owner && row.owner !== owner))
      throw new PublicError(404, 'ORDER_NOT_FOUND', '订单不存在');
    return publicOrder(row);
  }
  list(owner: string): PayOrder[] {
    return (
      this.db
        .prepare(
          `${ORDER_SELECT} WHERE o.user_id=${USER} ORDER BY o.created_at DESC,o.id DESC LIMIT 20`,
        )
        .all(owner) as OrderRow[]
    ).map(publicOrder);
  }
  creditCount(owner: string): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM pay_orders WHERE user_id=${USER} AND state=1`)
        .get(owner) as { n: number }
    ).n;
  }
  pending(owner: string): PayOrder | undefined {
    const row = this.db
      .prepare(
        `${ORDER_SELECT} WHERE o.user_id=${USER} AND o.state=0 AND o.expires_at>? ORDER BY o.created_at DESC,o.id DESC LIMIT 1`,
      )
      .get(owner, Date.now()) as OrderRow | undefined;
    return row ? publicOrder(row) : undefined;
  }
  createOrder(id: string, owner: string) {
    this.tx(() => {
      // Production sessions register OpenID first; placeholder users also support recovery tooling.
      this.db
        .prepare('INSERT INTO pay_users(owner) VALUES (?) ON CONFLICT(owner) DO NOTHING')
        .run(owner);
      this.db
        .prepare(
          `INSERT INTO pay_orders(trade_no,user_id,state,created_at,expires_at) VALUES (?,${USER},0,?,?)`,
        )
        .run(id, owner, Date.now(), Date.now() + 15 * 60000);
    });
    return this.order(id);
  }
  prepay(id: string, value: string) {
    this.db
      .prepare('UPDATE pay_orders SET prepay_id=? WHERE trade_no=? AND state=0')
      .run(value, id);
  }
  markPaid(id: string, transaction: string) {
    this.tx(() => {
      const order = this.order(id);
      if (order.transaction_id && order.transaction_id !== transaction)
        throw new PublicError(400, 'PAYMENT_MISMATCH', '支付订单信息不一致');
      this.db
        .prepare(
          'UPDATE pay_orders SET state=1,transaction_id=?,paid_at=?,prepay_id=NULL WHERE trade_no=? AND state=0',
        )
        .run(transaction, Date.now(), id);
    });
  }
  previous(owner: string, requestKey: string): string | undefined {
    return (
      this.db
        .prepare(`SELECT id FROM pay_evaluations WHERE user_id=${USER} AND request_hash=?`)
        .get(owner, requestHash(requestKey)) as { id: string } | undefined
    )?.id;
  }
  reserve(owner: string, id: string, requestKey: string) {
    this.tx(() => {
      const order = this.db
        .prepare(
          `SELECT id,user_id FROM pay_orders WHERE user_id=${USER} AND state=1 ORDER BY created_at,id LIMIT 1`,
        )
        .get(owner) as { id: number; user_id: number } | undefined;
      if (!order)
        throw new PublicError(402, 'PAYMENT_REQUIRED', '请先支付 ¥1.88，获得一次评审额度');
      this.db.prepare('UPDATE pay_orders SET state=2 WHERE id=? AND state=1').run(order.id);
      this.db
        .prepare('INSERT INTO pay_evaluations VALUES (?,?,?,?,0,?)')
        .run(id, order.user_id, requestHash(requestKey), order.id, Date.now());
    });
  }
  complete(id: string, report: EvaluationReport) {
    const encrypted = packReport(report, this.key, id);
    this.tx(() => {
      const row = this.db
        .prepare('SELECT order_id FROM pay_evaluations WHERE id=? AND state=0')
        .get(id) as { order_id: number } | undefined;
      if (!row) throw new Error('Evaluation reservation is no longer active');
      this.db
        .prepare('INSERT INTO pay_report_cache VALUES (?,?,?)')
        .run(id, encrypted, Date.now() + 10 * 60000);
      this.db.prepare('UPDATE pay_evaluations SET state=1 WHERE id=?').run(id);
      this.db.prepare('UPDATE pay_orders SET state=3 WHERE id=? AND state=2').run(row.order_id);
    });
  }
  release(id: string) {
    this.tx(() => {
      const row = this.db
        .prepare('SELECT order_id FROM pay_evaluations WHERE id=? AND state=0')
        .get(id) as { order_id: number } | undefined;
      if (!row) return;
      this.db.prepare('UPDATE pay_evaluations SET state=2 WHERE id=?').run(id);
      this.db.prepare('DELETE FROM pay_report_cache WHERE evaluation_id=?').run(id);
      this.db.prepare('UPDATE pay_orders SET state=1 WHERE id=? AND state=2').run(row.order_id);
    });
  }
  recoverInterrupted() {
    for (const row of this.db.prepare('SELECT id FROM pay_evaluations WHERE state=0').all() as {
      id: string;
    }[])
      this.release(row.id);
    this.sweep();
  }
  sweep(force = false) {
    const now = Date.now();
    if (!force && now >= this.lastSweep && now - this.lastSweep < 60000) return;
    this.db.prepare('DELETE FROM pay_report_cache WHERE expires_at<=?').run(now);
    // Bounded reclamation; financial audit and idempotency records remain intact.
    this.db.exec('PRAGMA incremental_vacuum(64); PRAGMA wal_checkpoint(PASSIVE);');
    this.lastSweep = now;
  }
  forgetReport(id: string, owner: string) {
    this.db
      .prepare(
        `DELETE FROM pay_report_cache WHERE evaluation_id=? AND EXISTS(SELECT 1 FROM pay_evaluations WHERE id=? AND user_id=${USER})`,
      )
      .run(id, id, owner);
  }
  recoverable(owner: string): string | undefined {
    return (
      this.db
        .prepare(
          `SELECT id FROM (
      SELECT id,created_at FROM pay_evaluations WHERE user_id=${USER} AND state=0
      UNION ALL SELECT e.id,e.created_at FROM pay_report_cache c JOIN pay_evaluations e ON e.id=c.evaluation_id
        WHERE e.user_id=${USER} AND e.state=1 AND c.expires_at>?
      ) ORDER BY created_at DESC LIMIT 1`,
        )
        .get(owner, owner, Date.now()) as { id: string } | undefined
    )?.id;
  }
  job(id: string, owner: string): JobStatus | undefined {
    const row = this.db
      .prepare(
        `SELECT e.state,c.report,c.expires_at FROM pay_evaluations e
      LEFT JOIN pay_report_cache c ON c.evaluation_id=e.id WHERE e.id=? AND e.user_id=${USER}`,
      )
      .get(id, owner) as
      | { state: number; report: Uint8Array | null; expires_at: number | null }
      | undefined;
    if (!row) return;
    if (row.state === 2)
      return {
        id,
        status: 'failed',
        completedInvestors: 0,
        totalInvestors: 3,
        error: { code: 'CREDIT_RESTORED', message: '本次评审未完成，额度已恢复，可重新发起' },
      };
    if (row.state === 0) return { id, status: 'running', completedInvestors: 0, totalInvestors: 3 };
    if (!row.report || !row.expires_at || row.expires_at <= Date.now()) return;
    const report = unpackReport(row.report, this.key, id) as EvaluationReport;
    return {
      id,
      status: 'done',
      completedInvestors: report.investors.length,
      totalInvestors: 3,
      report,
    };
  }
  refund(id: string, action: 'hold' | 'confirm' | 'release', refundId?: string) {
    if (action === 'confirm' && !refundId)
      throw new Error('Confirm requires the actual WeChat refund ID');
    const from = action === 'hold' ? 1 : 4;
    const to = action === 'hold' ? 4 : action === 'confirm' ? 5 : 1;
    const result = this.db
      .prepare('UPDATE pay_orders SET state=?,refund_id=? WHERE trade_no=? AND state=?')
      .run(to, refundId ?? null, id, from);
    if (result.changes !== 1)
      throw new Error('Order cannot make this refund transition; check its current state');
  }
}
