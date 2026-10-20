import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { packReport, seal, unseal } from './payment-codec';

export const ORDER_STATES = [
  'pending',
  'paid',
  'reserved',
  'spent',
  'refund_hold',
  'refunded',
] as const;
export const EVALUATION_STATES = ['pending', 'done', 'released'] as const;
export const requestHash = (key: string) => createHash('sha256').update(key).digest();

const SCHEMA = `
  CREATE TABLE pay_users (
    id INTEGER PRIMARY KEY, owner TEXT NOT NULL UNIQUE, openid BLOB
  );
  CREATE TABLE pay_orders (
    id INTEGER PRIMARY KEY, trade_no TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES pay_users(id),
    state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 5),
    prepay_id TEXT, transaction_id TEXT UNIQUE,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 188 CHECK(amount=188),
    currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'),
    paid_at INTEGER, refund_id TEXT UNIQUE
  );
  CREATE INDEX pay_orders_user_created ON pay_orders(user_id,created_at);
  CREATE INDEX pay_orders_available ON pay_orders(user_id,created_at) WHERE state=1;
  CREATE TABLE pay_evaluations (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES pay_users(id),
    request_hash BLOB NOT NULL CHECK(length(request_hash)=32),
    order_id INTEGER NOT NULL REFERENCES pay_orders(id),
    state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 2), created_at INTEGER NOT NULL,
    UNIQUE(user_id,request_hash)
  ) WITHOUT ROWID;
  CREATE INDEX pay_evaluations_pending ON pay_evaluations(user_id,created_at) WHERE state=0;
  CREATE TABLE pay_report_cache (
    evaluation_id TEXT PRIMARY KEY REFERENCES pay_evaluations(id),
    report BLOB NOT NULL, expires_at INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX pay_report_expiry ON pay_report_cache(expires_at);
`;

type LegacyOrder = {
  id: string;
  owner: string;
  status: string;
  prepay_id: string | null;
  transaction_id: string | null;
  created_at: number;
  expires_at: number;
  amount: number;
  currency: string;
  paid_at: number | null;
  refund_id: string | null;
};
type LegacyEvaluation = {
  id: string;
  owner: string;
  request_key: string;
  order_id: string;
  status: string;
  report: Uint8Array | null;
  expires_at: number;
};

/** Schema upgrades are atomic. Unknown versions/states and corrupt reports fail closed. */
export function initializePaymentSchema(db: DatabaseSync, reportKey: Buffer, identityKey: Buffer) {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;
  if (version === 2) return;
  if (version !== 0) throw new Error(`Unsupported payment schema version: ${version}`);
  const legacy = Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pay_orders'").get(),
  );
  if (!legacy) db.exec('PRAGMA auto_vacuum=INCREMENTAL');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!legacy) db.exec(SCHEMA);
    else {
      // Verify old records before writing; financial records are never silently discarded.
      db.exec(`ALTER TABLE pay_users RENAME TO pay_users_v1;
        ALTER TABLE pay_orders RENAME TO pay_orders_v1;
        ALTER TABLE pay_evaluations RENAME TO pay_evaluations_v1;`);
      db.exec(SCHEMA);
      const insertUser = db.prepare('INSERT INTO pay_users(owner,openid) VALUES (?,?)');
      for (const row of db.prepare('SELECT owner,openid FROM pay_users_v1').iterate() as Iterable<{
        owner: string;
        openid: string;
      }>)
        insertUser.run(row.owner, seal(Buffer.from(row.openid), identityKey, row.owner));
      db.exec(`INSERT OR IGNORE INTO pay_users(owner)
        SELECT owner FROM pay_orders_v1 UNION SELECT owner FROM pay_evaluations_v1;`);
      const findUser = db.prepare('SELECT id FROM pay_users WHERE owner=?');
      const insertOrder = db.prepare(`INSERT INTO pay_orders
        (trade_no,user_id,state,prepay_id,transaction_id,created_at,expires_at,amount,currency,paid_at,refund_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const row of db
        .prepare('SELECT * FROM pay_orders_v1')
        .iterate() as Iterable<LegacyOrder>) {
        const state = ORDER_STATES.indexOf(row.status as (typeof ORDER_STATES)[number]);
        if (state < 0) throw new Error('Unknown legacy payment order state');
        const user = findUser.get(row.owner) as { id: number };
        insertOrder.run(
          row.id,
          user.id,
          state,
          state === 0 ? row.prepay_id : null,
          row.transaction_id,
          row.created_at,
          row.expires_at,
          row.amount,
          row.currency,
          row.paid_at,
          row.refund_id,
        );
      }
      const findOrder = db.prepare('SELECT id,user_id FROM pay_orders WHERE trade_no=?');
      const insertEvaluation = db.prepare('INSERT INTO pay_evaluations VALUES (?,?,?,?,?,?)');
      const insertReport = db.prepare('INSERT INTO pay_report_cache VALUES (?,?,?)');
      const now = Date.now();
      for (const row of db
        .prepare('SELECT * FROM pay_evaluations_v1')
        .iterate() as Iterable<LegacyEvaluation>) {
        const state = EVALUATION_STATES.indexOf(row.status as (typeof EVALUATION_STATES)[number]);
        if (state < 0) throw new Error('Unknown legacy evaluation state');
        const user = findUser.get(row.owner) as { id: number };
        const order = findOrder.get(row.order_id) as { id: number; user_id: number } | undefined;
        if (!order || order.user_id !== user.id)
          throw new Error('Legacy payment ownership mismatch');
        insertEvaluation.run(
          row.id,
          user.id,
          requestHash(row.request_key),
          order.id,
          state,
          row.expires_at - 600000,
        );
        if (state === 1 && row.report && row.expires_at > now) {
          const report = JSON.parse(unseal(row.report, reportKey, row.id).toString());
          insertReport.run(row.id, packReport(report, reportKey, row.id), row.expires_at);
        }
      }
      for (const table of ['pay_orders', 'pay_evaluations']) {
        const count = (name: string) =>
          (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number }).n;
        if (count(table) !== count(`${table}_v1`))
          throw new Error('Payment migration record count mismatch');
      }
      if (db.prepare('PRAGMA foreign_key_check').all().length)
        throw new Error('Payment migration foreign key mismatch');
      db.exec('DROP TABLE pay_evaluations_v1; DROP TABLE pay_orders_v1; DROP TABLE pay_users_v1;');
    }
    db.exec('PRAGMA user_version=2; COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
