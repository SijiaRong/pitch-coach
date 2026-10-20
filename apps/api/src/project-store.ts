import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  CommerceOrder,
  EvaluationReport,
  PrivateProjectPack,
  PublishProjectInput,
  GiftId,
} from '@pitchcoach/shared';
import { publicReportCopy, revenueSplit, SERVICE_FEE_RATE_BPS } from '@pitchcoach/shared';
import { PublicError } from './errors';

export interface ProjectRow {
  id: string;
  owner: string;
  report: string;
  pack: string | null;
  anonymous: number;
  unlock_enabled: number;
  price: number;
  tips_enabled: number;
  active: number;
  revision: number;
  created_at: string;
  views: number;
  referrals: number;
  code: string | null;
  fee_consented_at: string | null;
}
export interface OrderRow {
  id: string;
  project_id: string;
  buyer: string;
  kind: CommerceOrder['kind'];
  gift_id: GiftId | null;
  gift_name: string | null;
  amount: number;
  status: CommerceOrder['status'];
  product: string;
  openid: string;
  snapshot: string | null;
  contact: string;
  message: string;
  idem: string;
  request_hash: string;
  provider_id: string | null;
  created_at: string;
  paid_at: string | null;
  refund: number;
  checked_at: number;
  receipt: number | null;
  channel_fee: number | null;
  fee_rate_bps: number;
  refund_known: number;
}
export class ProjectStore {
  readonly db: DatabaseSync;
  private key: Buffer;
  constructor(path: string, key: string) {
    if (!/^[a-f\d]{64}$/i.test(key)) throw new Error('Invalid project encryption key');
    this.key = Buffer.from(key, 'hex');
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner TEXT NOT NULL,report TEXT NOT NULL,pack TEXT,anonymous INTEGER NOT NULL,unlock_enabled INTEGER NOT NULL,price INTEGER NOT NULL,tips_enabled INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 0,referrals INTEGER NOT NULL DEFAULT 0,code TEXT);
      CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),buyer TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,product TEXT NOT NULL,openid TEXT NOT NULL,snapshot TEXT,contact TEXT NOT NULL,message TEXT NOT NULL,idem TEXT NOT NULL,request_hash TEXT NOT NULL,provider_id TEXT UNIQUE,created_at TEXT NOT NULL,paid_at TEXT,refund INTEGER NOT NULL DEFAULT 0,checked_at INTEGER NOT NULL DEFAULT 0,UNIQUE(buyer,idem));
      CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer);
      CREATE INDEX IF NOT EXISTS orders_project ON orders(project_id);
      CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),amount INTEGER NOT NULL);`);
    // Additive migrations preserve already accepted orders and encrypted purchase snapshots.
    for (const [table, columns] of Object.entries({
      projects: { fee_consented_at: 'TEXT' },
      orders: {
        receipt: 'INTEGER',
        channel_fee: 'INTEGER',
        fee_rate_bps: `INTEGER NOT NULL DEFAULT ${SERVICE_FEE_RATE_BPS}`,
        refund_known: 'INTEGER NOT NULL DEFAULT 1',
        gift_id: 'TEXT',
        gift_name: 'TEXT',
      },
    })) {
      const present = new Set(
        (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
          (column) => column.name,
        ),
      );
      for (const [name, definition] of Object.entries(columns))
        if (!present.has(name))
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
  seal(value: unknown, context: string): string {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const content = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64');
  }
  unseal<T>(value: string, context: string): T {
    const bytes = Buffer.from(value, 'base64'),
      decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
    );
  }
  publish(owner: string, input: PublishProjectInput) {
    const count = this.db
      .prepare('SELECT count(*) AS n FROM projects WHERE owner=? AND active=1')
      .get(owner) as { n: number };
    if (count.n >= 100) throw new PublicError(429, 'PROJECT_LIMIT', '公开项目已达数量上限');
    const id = randomBytes(16).toString('base64url');
    const report = publicReportCopy(input.report, input.anonymous);
    this.db
      .prepare(
        'INSERT INTO projects(id,owner,report,pack,anonymous,unlock_enabled,price,tips_enabled,created_at,fee_consented_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        owner,
        JSON.stringify(report),
        input.unlockEnabled ? this.seal(input.privatePack, `project:${id}`) : null,
        Number(input.anonymous),
        Number(input.unlockEnabled),
        input.unlockPriceFen,
        Number(input.tipsEnabled),
        new Date().toISOString(),
        input.serviceFeeConsent ? new Date().toISOString() : null,
      );
    return this.project(id);
  }
  project(id: string, active = true): ProjectRow {
    const value = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as unknown as
      | ProjectRow
      | undefined;
    if (!value || (active && !value.active))
      throw new PublicError(404, 'PROJECT_NOT_FOUND', '项目未公开或已停止分享');
    return value;
  }
  owned(id: string, owner: string) {
    const value = this.project(id, false);
    if (value.owner !== owner)
      throw new PublicError(404, 'PROJECT_NOT_FOUND', '找不到你的公开项目');
    return value;
  }
  order(id: string): OrderRow {
    const value = this.db.prepare('SELECT * FROM orders WHERE id=?').get(id) as unknown as
      | OrderRow
      | undefined;
    if (!value) throw new PublicError(404, 'ORDER_NOT_FOUND', '订单不存在');
    return value;
  }
  orderFor(id: string, buyer: string) {
    const value = this.order(id);
    if (value.buyer !== buyer) throw new PublicError(404, 'ORDER_NOT_FOUND', '订单不存在');
    return value;
  }
  entitlement(id: string, buyer: string): OrderRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM orders WHERE project_id=? AND buyer=? AND kind='unlock' AND status='paid' ORDER BY paid_at DESC LIMIT 1",
      )
      .get(id, buyer) as unknown as OrderRow | undefined;
  }
  markPaid(id: string, providerId: string) {
    this.db
      .prepare(
        "UPDATE orders SET status='paid',provider_id=?,paid_at=COALESCE(paid_at,?),checked_at=? WHERE id=? AND status IN ('pending','paid')",
      )
      .run(providerId, new Date().toISOString(), Date.now(), id);
  }
  recordRefund(order: OrderRow, refundId: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > order.amount)
      throw new PublicError(400, 'REFUND_INVALID', '退款金额无法核对');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db
        .prepare('SELECT order_id,amount FROM refunds WHERE id=?')
        .get(refundId) as { order_id: string; amount: number } | undefined;
      if (existing && (existing.order_id !== order.id || existing.amount !== amount))
        throw new PublicError(400, 'REFUND_INVALID', '退款编号与订单不匹配');
      if (!existing) {
        const current = this.order(order.id);
        const recorded = this.db
          .prepare('SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE order_id=?')
          .get(order.id) as { total: number };
        const cumulative = recorded.total + amount;
        if (cumulative > current.amount)
          throw new PublicError(400, 'REFUND_INVALID', '累计退款金额无法核对');
        this.db
          .prepare('INSERT INTO refunds(id,order_id,amount) VALUES(?,?,?)')
          .run(refundId, order.id, amount);
        this.db
          .prepare(
            "UPDATE orders SET status='refunded',refund=MAX(refund,?),refund_known=1 WHERE id=?",
          )
          .run(cumulative, order.id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  revoke(id: string, owner: string) {
    this.owned(id, owner);
    this.db.prepare('UPDATE projects SET active=0,code=NULL WHERE id=?').run(id);
  }
  privatePack(order: OrderRow): PrivateProjectPack {
    if (order.kind !== 'unlock' || order.status !== 'paid' || !order.snapshot)
      throw new PublicError(403, 'NOT_UNLOCKED', '完成并核实购买后可查看资料');
    return this.unseal(order.snapshot, `order:${order.id}:pack`);
  }
  revenue(projectId: string) {
    const totals = {
      grossPaidFen: 0,
      refundFen: 0,
      verifiedReceiptsFen: 0,
      netReceiptsFen: 0,
      platformFeeFen: 0,
      projectShareFen: 0,
      channelFeeFen: 0,
      unreconciledOrders: 0,
      channelFeePendingOrders: 0,
    };
    // Iterate all relevant rows: the recent-order display limit must never truncate the ledger.
    for (const item of this.db
      .prepare(
        "SELECT * FROM orders WHERE project_id=? AND (paid_at IS NOT NULL OR status='refunded')",
      )
      .iterate(projectId)) {
      const row = item as unknown as OrderRow;
      totals.grossPaidFen += row.amount;
      totals.refundFen += row.refund;
      if (row.receipt !== null) totals.verifiedReceiptsFen += row.receipt;
      const split =
        row.receipt !== null && row.refund_known
          ? revenueSplit(row.receipt, row.refund, row.fee_rate_bps)
          : undefined;
      if (split) {
        totals.netReceiptsFen += split.netReceiptsFen;
        totals.platformFeeFen += split.platformFeeFen;
        totals.projectShareFen += split.projectShareFen;
      } else totals.unreconciledOrders++;
      if (row.channel_fee !== null) totals.channelFeeFen += row.channel_fee;
      else totals.channelFeePendingOrders++;
    }
    return totals;
  }
  sweep() {
    // Do not discard pending purchase snapshots on a local clock: WeChat may confirm late.
    // A snapshot is cleared only after the provider confirms the order is closed.
  }
  close() {
    this.db.close();
    this.key.fill(0);
  }
}
export const orderDto = (order: OrderRow): CommerceOrder => ({
  id: order.id,
  projectId: order.project_id,
  kind: order.kind,
  amountFen: order.amount,
  status: order.status,
  mode: 'live',
  createdAt: order.created_at,
  serviceFeeRateBps: order.fee_rate_bps,
  ...(order.gift_id && order.gift_name
    ? { gift: { id: order.gift_id, name: order.gift_name } }
    : {}),
  ...(order.paid_at ? { paidAt: order.paid_at } : {}),
});
