import type { BillingStatus, WechatPaymentParams } from '@pitchcoach/shared';

export interface PaymentFlow {
  /** Present only after this click explicitly confirmed the displayed purchase price. */
  purchase?: { priceFen: number };
  status(): Promise<BillingStatus>;
  query(id: string): Promise<{ billing: BillingStatus }>;
  create(): Promise<{ orderId: string; payment: WechatPaymentParams }>;
  pay(params: WechatPaymentParams): Promise<void>;
  sleep(): Promise<void>;
  stopped(): boolean;
}
/** A successful client callback never grants credit; only the server ledger does. */
export async function ensureReviewCredit(flow: PaymentFlow): Promise<BillingStatus> {
  let state = await flow.status();
  if (state.credits || state.recoverableJobId) return state;
  const pending = state.orders.find((order) => order.status === 'pending');
  if (pending) {
    state = (await flow.query(pending.id)).billing;
    if (state.credits || state.recoverableJobId) return state;
    throw new Error(state.orders.some((order) => order.status === 'pending')
      ? '订单结果仍待确认。若已扣款，请勿重复付款，先查询订单与额度'
      : '订单与额度已更新，请重新确认本次评审消耗');
  }
  if (!flow.purchase) throw new Error('可用额度已变化，请重新确认本次评审消耗');
  if (!state.enabled || state.priceFen !== flow.purchase.priceFen)
    throw new Error('价格已更新，请重新确认本次评审');
  if (flow.stopped()) throw new Error('已取消，已有额度会保留');
  let order;
  try {
    order = await flow.create();
  } catch (error) {
    // A notification may have arrived between reading the balance and creating an order.
    state = await flow.status();
    if (state.credits || state.recoverableJobId) return state;
    throw error;
  }
  let paymentError: unknown;
  try {
    await flow.pay(order.payment);
  } catch (error) {
    paymentError = error;
  }
  for (let attempt = 0; attempt < (paymentError ? 1 : 12); attempt++) {
    state = (await flow.query(order.orderId)).billing;
    if (state.credits || state.recoverableJobId) return state;
    if (flow.stopped()) throw new Error('已取消，支付成功后额度会保留');
    if (!paymentError) await flow.sleep();
  }
  if (paymentError) throw paymentError;
  throw new Error('支付结果仍在确认，请勿重复付款，稍后点击“查询订单与额度”');
}
