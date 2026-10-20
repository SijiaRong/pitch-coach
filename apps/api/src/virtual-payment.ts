import { createHmac } from 'node:crypto';
import type { VirtualPayParameters } from '@pitchcoach/shared';
import type { Config } from './config';
import { PublicError } from './errors';
import { IdentityVault, WechatApi } from './wechat-api';
import { ProjectStore } from './project-store';
import type { OrderRow } from './project-store';

const hmac = (key: string, value: string) => createHmac('sha256', key).update(value).digest('hex');
export class VirtualPayment {
  private checking = new Map<string, Promise<OrderRow>>();
  constructor(
    private config: Config,
    private api: WechatApi,
    private identities: IdentityVault,
    private store: ProjectStore,
  ) {}
  available(kind: 'unlock' | 'gift' | 'tip', amount: number) {
    return (
      this.config.paymentEnabled &&
      Boolean(
        this.config.paymentProducts[`${kind}:${amount}`] ||
          (kind === 'gift' && this.config.paymentProducts[`tip:${amount}`]),
      )
    );
  }
  product(kind: 'unlock' | 'gift' | 'tip', amount: number) {
    if (!this.config.paymentEnabled)
      throw new PublicError(503, 'PAYMENT_NOT_CONFIGURED', '真实收款尚未启用，暂不扣款');
    const id =
      this.config.paymentProducts[`${kind}:${amount}`] ||
      (kind === 'gift' ? this.config.paymentProducts[`tip:${amount}`] : undefined);
    if (!id)
      throw new PublicError(
        409,
        'PRICE_NOT_ENABLED',
        '该价位尚未在微信发布对应商品，请联系项目方调整或稍后再试',
      );
    return id;
  }
  identity(owner: string) {
    return this.identities.get(owner);
  }
  parameters(order: OrderRow, owner: string): VirtualPayParameters {
    const identity = this.identities.get(owner);
    if (this.store.unseal<string>(order.openid, `order:${order.id}:openid`) !== identity.openid)
      throw new PublicError(403, 'ORDER_OWNER_MISMATCH', '订单与当前微信用户不匹配');
    const signData = JSON.stringify({
      offerId: this.config.VIRTUALPAY_OFFER_ID,
      buyQuantity: 1,
      env: 0,
      currencyType: 'CNY',
      productId: order.product,
      goodsPrice: order.amount,
      outTradeNo: order.id,
      attach: order.id,
    });
    return {
      mode: 'short_series_goods',
      signData,
      paySig: hmac(this.config.VIRTUALPAY_APP_KEY, `requestVirtualPayment&${signData}`),
      signature: hmac(identity.sessionKey, signData),
    };
  }
  async check(order: OrderRow, force = false): Promise<OrderRow> {
    if (!this.config.paymentEnabled) return order;
    if (!force && Date.now() - order.checked_at < 5000) return order;
    const current = this.checking.get(order.id);
    if (current) return current;
    const work = this.query(order).finally(() => this.checking.delete(order.id));
    this.checking.set(order.id, work);
    return work;
  }
  private async query(order: OrderRow) {
    const openid = this.store.unseal<string>(order.openid, `order:${order.id}:openid`);
    const body = JSON.stringify({ openid, env: 0, order_id: order.id });
    const token = await this.api.token();
    const query = new URLSearchParams({
      access_token: token,
      pay_sig: hmac(this.config.VIRTUALPAY_APP_KEY, `/xpay/query_order&${body}`),
    });
    const data = await this.api.post(`https://api.weixin.qq.com/xpay/query_order?${query}`, body);
    const info = data.order;
    if (
      !info ||
      info.order_id !== order.id ||
      ![0, 7].includes(info.order_type) ||
      info.order_fee !== order.amount ||
      (info.env_type !== undefined && info.env_type !== 0)
    )
      throw new PublicError(502, 'PAYMENT_MISMATCH', '订单金额或身份未通过微信核验，尚未开放资料');
    for (const [key, max] of [
      ['paid_fee', order.amount],
      ['refund_fee', order.amount],
      ['platform_fee_fen', order.amount],
      ['cps_fee_fen', order.amount],
    ] as const) {
      if (
        info[key] !== undefined &&
        (!Number.isSafeInteger(info[key]) || info[key] < 0 || info[key] > max)
      )
        throw new PublicError(502, 'PAYMENT_MISMATCH', '微信实收或退款金额无法核对');
    }
    if ([2, 3, 4, 5, 8].includes(info.status)) {
      const channelFee =
        Number.isSafeInteger(info.platform_fee_fen) && Number.isSafeInteger(info.cps_fee_fen)
          ? info.platform_fee_fen + info.cps_fee_fen
          : null;
      this.store.db
        .prepare(
          'UPDATE orders SET receipt=COALESCE(?,receipt),channel_fee=COALESCE(?,channel_fee) WHERE id=?',
        )
        .run(info.paid_fee ?? null, channelFee, order.id);
    }
    this.store.db.prepare('UPDATE orders SET checked_at=? WHERE id=?').run(Date.now(), order.id);
    if ([2, 3, 4].includes(info.status) && !(info.refund_fee > 0)) {
      this.store.markPaid(
        order.id,
        typeof info.wx_order_id === 'string' ? info.wx_order_id : `xpay:${order.id}`,
      );
      if (info.status === 2) {
        // Rights are idempotently stored before acknowledging fulfillment. A failed ack is retried.
        const delivery = JSON.stringify({ env: 0, order_id: order.id });
        const deliveryQuery = new URLSearchParams({
          access_token: token,
          pay_sig: hmac(this.config.VIRTUALPAY_APP_KEY, `/xpay/notify_provide_goods&${delivery}`),
        });
        await this.api.post(
          `https://api.weixin.qq.com/xpay/notify_provide_goods?${deliveryQuery}`,
          delivery,
        );
      }
    } else if ([5, 8].includes(info.status) || info.refund_fee > 0) {
      this.store.db
        .prepare(
          "UPDATE orders SET status='refunded',refund=MAX(refund,?),refund_known=CASE WHEN ?>0 OR refund>0 THEN 1 ELSE 0 END WHERE id=?",
        )
        .run(
          Number.isSafeInteger(info.refund_fee) && info.refund_fee <= order.amount
            ? info.refund_fee
            : order.refund,
          info.refund_fee || 0,
          order.id,
        );
    } else if (info.status === 6 && order.status === 'pending') {
      this.store.db
        .prepare(
          "UPDATE orders SET status='closed',contact='',message='',snapshot=NULL WHERE id=? AND status='pending'",
        )
        .run(order.id);
    }
    return this.store.order(order.id);
  }
  async notify(message: Record<string, any>) {
    if (message.MsgType !== 'event') return 'success';
    if (message.Event === 'xpay_goods_deliver_notify') {
      const order = this.store.order(String(message.OutTradeNo || ''));
      if (
        String(message.Env) !== '0' ||
        message.OpenId !== this.store.unseal(order.openid, `order:${order.id}:openid`)
      )
        throw new PublicError(403, 'NOTIFICATION_MISMATCH', '支付通知与订单不匹配');
      const result = await this.check(order, true);
      if (result.status !== 'paid' && result.status !== 'refunded')
        throw new PublicError(503, 'PAYMENT_PENDING', '支付仍在核对');
      return '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>';
    }
    if (message.Event === 'xpay_refund_notify') {
      if (String(message.RetCode) !== '0')
        return '<xml><ErrCode>0</ErrCode><ErrMsg>success</ErrMsg></xml>';
      const order = this.store.order(String(message.MchOrderId || ''));
      if (
        message.OpenId !== this.store.unseal(order.openid, `order:${order.id}:openid`) ||
        String(message.Env) !== '0' ||
        typeof message.WxRefundId !== 'string' ||
        !message.WxRefundId
      )
        throw new PublicError(403, 'NOTIFICATION_MISMATCH', '退款通知与订单不匹配');
      this.store.recordRefund(order, message.WxRefundId, Number(message.RefundFee));
      return '<xml><ErrCode>0</ErrCode><ErrMsg>success</ErrMsg></xml>';
    }
    if (message.Event === 'xpay_subscribe_ios_refund_query_notify')
      return '<xml><ErrCode>0</ErrCode><ErrMsg>success</ErrMsg><IosRefundQueryResponse><result_code>0</result_code><result_info>建议按平台流程处理退款</result_info><evidence>本服务不自动拒绝用户退款申请；以平台最终结果为准。</evidence></IosRefundQueryResponse></xml>';
    return 'success';
  }
  async reconcile() {
    if (!this.config.paymentEnabled) return;
    const rows = this.store.db
      .prepare(
        "SELECT * FROM orders WHERE (status IN ('pending','paid') OR (status='refunded' AND (receipt IS NULL OR refund_known=0 OR channel_fee IS NULL))) AND checked_at<? ORDER BY checked_at LIMIT 6",
      )
      .all(Date.now() - 5 * 60000) as unknown as OrderRow[];
    await Promise.allSettled(rows.map((order) => this.check(order)));
  }
}
