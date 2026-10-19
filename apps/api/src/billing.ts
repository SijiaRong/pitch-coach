import { randomBytes } from 'node:crypto';
import { REVIEW_PRICE_FEN } from '@pitchcoach/shared';
import type { BillingStatus } from '@pitchcoach/shared';
import type { Config } from './config';
import { PaymentStore } from './payment-store';
import { PublicError } from './errors';
import { WechatPay } from './wechat-pay';
import type { PaidTransaction, PaymentGateway } from './wechat-pay';

export class Billing {
  private creating = new Map<
    string,
    Promise<{ orderId: string; payment: ReturnType<PaymentGateway['params']> }>
  >();
  private checking = new Map<string, Promise<void>>();
  private checkedAt = new Map<string, number>();
  constructor(
    readonly config: Config,
    readonly store: PaymentStore,
    readonly gateway: PaymentGateway,
  ) {
    store.bindMerchant(config.WECHAT_APP_ID, config.WECHAT_PAY_MCH_ID);
    store.recoverInterrupted();
  }
  static create(config: Config) {
    if (config.PAYMENTS_ENABLED !== 'true') return;
    const gateway = new WechatPay(config);
    const store = new PaymentStore(config.PAYMENT_DB_PATH, config.SESSION_SECRET);
    try {
      return new Billing(config, store, gateway);
    } catch (error) {
      store.close();
      throw error;
    }
  }
  register(owner: string, openid: string) {
    this.store.register(owner, openid);
  }
  status(owner: string): BillingStatus {
    this.store.sweep();
    return {
      enabled: true,
      priceFen: REVIEW_PRICE_FEN,
      credits: this.store.creditCount(owner),
      supportContact: this.config.PAY_SUPPORT_CONTACT,
      recoverableJobId: this.store.recoverable(owner),
      orders: this.store
        .list(owner)
        .map((o) => ({ id: o.id, status: o.status, createdAt: o.created_at })),
    };
  }
  createOrder(owner: string) {
    const running = this.creating.get(owner);
    if (running) return running;
    const work = this.prepay(owner).finally(() => this.creating.delete(owner));
    this.creating.set(owner, work);
    return work;
  }
  private async prepay(owner: string) {
    if (this.store.creditCount(owner))
      throw new PublicError(409, 'CREDIT_AVAILABLE', '已有可用评审额度，无需重复支付');
    if (this.store.recoverable(owner))
      throw new PublicError(409, 'REPORT_AVAILABLE', '已有进行中或待领取评审，请先查看');
    const openid = this.store.openid(owner);
    const pending = this.store.pending(owner);
    if (pending?.prepay_id) {
      await this.refresh(pending.id, owner);
      if (this.store.order(pending.id).status !== 'pending')
        throw new PublicError(409, 'CREDIT_AVAILABLE', '支付已确认，请使用现有额度');
    }
    const order = pending || this.store.createOrder(`PC${randomBytes(15).toString('hex')}`, owner);
    const prepay =
      order.prepay_id || (await this.gateway.prepay(order.id, openid, order.expires_at));
    this.store.prepay(order.id, prepay);
    return { orderId: order.id, payment: this.gateway.params(prepay) };
  }
  private accept(transaction: PaidTransaction) {
    // Runtime validation also protects query results and injected adapters.
    if (
      transaction.appid !== this.config.WECHAT_APP_ID ||
      transaction.mchid !== this.config.WECHAT_PAY_MCH_ID ||
      transaction.trade_state !== 'SUCCESS' ||
      transaction.trade_type !== 'JSAPI' ||
      transaction.amount.total !== REVIEW_PRICE_FEN ||
      transaction.amount.currency !== 'CNY'
    )
      throw new PublicError(400, 'PAYMENT_MISMATCH', '支付信息与订单不一致');
    const order = this.store.order(transaction.out_trade_no);
    if (this.store.openid(order.owner) !== transaction.payer.openid)
      throw new PublicError(400, 'PAYMENT_MISMATCH', '支付用户与订单不一致');
    this.store.markPaid(order.id, transaction.transaction_id);
  }
  async refresh(id: string, owner: string) {
    const order = this.store.order(id, owner);
    if (order.status !== 'pending' || !order.prepay_id) return;
    const previous = this.checking.get(id);
    if (previous) return previous;
    if (Date.now() - (this.checkedAt.get(id) || 0) < 3000) return;
    if (this.checkedAt.size > 10000) this.checkedAt.clear();
    const work = this.gateway
      .query(id)
      .then((transaction) => {
        if (transaction) this.accept(transaction);
      })
      .finally(() => {
        this.checkedAt.set(id, Date.now());
        this.checking.delete(id);
      });
    this.checking.set(id, work);
    return work;
  }
  notification(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    this.accept(this.gateway.notification(raw, headers));
  }
  close() {
    this.store.close();
  }
}
