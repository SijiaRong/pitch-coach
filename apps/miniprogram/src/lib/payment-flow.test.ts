import { describe, expect, it, vi } from 'vitest';
import type { BillingStatus } from '@pitchcoach/shared';
import { ensureReviewCredit } from './payment-flow';
import type { PaymentFlow } from './payment-flow';
const empty: BillingStatus = {
  enabled: true,
  priceFen: 188,
  credits: 0,
  orders: [],
  supportContact: 'support@example.com',
};
function setup(): PaymentFlow {
  return {
    purchase: { priceFen: 188 },
    status: vi.fn(async () => empty),
    query: vi.fn(async () => ({ billing: empty })),
    create: vi.fn(async () => ({
      orderId: 'order-test',
      payment: {
        timeStamp: '1',
        nonceStr: 'nonce',
        package: 'prepay_id=test',
        signType: 'RSA' as const,
        paySign: 'test',
      },
    })),
    pay: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
    stopped: () => false,
  };
}
describe('付款与评审前的额度确认', () => {
  it('旧额度被别处使用后不把用额度升级为新付款', async () => {
    const flow = setup();
    flow.purchase = undefined;
    await expect(ensureReviewCredit(flow)).rejects.toThrow('额度已变化');
    expect(flow.create).not.toHaveBeenCalled();
  });
  it('最新账单价格不同于用户本次确认的价格时不建单', async () => {
    const flow = setup();
    flow.status = vi.fn(async () => ({ ...empty, priceFen: 299 }));
    await expect(ensureReviewCredit(flow)).rejects.toThrow('价格已更新');
    expect(flow.create).not.toHaveBeenCalled();
  });
  it('旧订单仍待确认或刚关闭时，都要求重新确认且不建单', async () => {
    for (const status of ['pending', 'closed']) {
      const flow = setup();
      flow.status = vi.fn(async () => ({ ...empty, orders: [{ id: 'old', status: 'pending', createdAt: 1 }] }));
      flow.query = vi.fn(async () => ({ billing: { ...empty, orders: [{ id: 'old', status, createdAt: 1 }] } }));
      await expect(ensureReviewCredit(flow)).rejects.toThrow(status === 'pending' ? '勿重复付款' : '重新确认');
      expect(flow.create).not.toHaveBeenCalled();
      expect(flow.pay).not.toHaveBeenCalled();
    }
  });
  it('已有额度和待领取报告不会再次付款', async () => {
    for (const state of [
      { ...empty, credits: 1 },
      { ...empty, recoverableJobId: 'recover-me' },
    ]) {
      const flow = setup();
      flow.status = vi.fn(async () => state);
      expect(await ensureReviewCredit(flow)).toEqual(state);
      expect(flow.create).not.toHaveBeenCalled();
      expect(flow.pay).not.toHaveBeenCalled();
    }
  });
  it('前端支付成功也必须等待后端查单确认', async () => {
    const flow = setup();
    const statuses = [empty, empty, { ...empty, credits: 1 }];
    flow.query = vi.fn(async () => ({ billing: statuses.shift()! }));
    expect((await ensureReviewCredit(flow)).credits).toBe(1);
    expect(flow.query).toHaveBeenCalledTimes(3);
  });
  it('支付成功但后端未确认时不会放行，也不会再次创建订单', async () => {
    const flow = setup();
    await expect(ensureReviewCredit(flow)).rejects.toThrow('勿重复付款');
    expect(flow.create).toHaveBeenCalledTimes(1);
  });
  it('取消支付后查到实际已付款时使用额度，避免重复扣款', async () => {
    const flow = setup();
    flow.pay = vi.fn(async () => {
      throw new Error('cancel');
    });
    flow.query = vi.fn(async () => ({ billing: { ...empty, credits: 1 } }));
    expect((await ensureReviewCredit(flow)).credits).toBe(1);
  });
  it('查询到旧订单已支付时不再拉起收银台', async () => {
    const flow = setup();
    flow.status = vi.fn(async () => ({
      ...empty,
      orders: [{ id: 'old-order', status: 'pending', createdAt: 1 }],
    }));
    flow.query = vi.fn(async () => ({ billing: { ...empty, credits: 1 } }));
    expect((await ensureReviewCredit(flow)).credits).toBe(1);
    expect(flow.create).not.toHaveBeenCalled();
  });
  it('查询支付状态失败时停止流程，不用新付款覆盖未知结果', async () => {
    const flow = setup();
    flow.status = vi.fn(async () => ({
      ...empty,
      orders: [{ id: 'unknown-order', status: 'pending', createdAt: 1 }],
    }));
    flow.query = vi.fn(async () => {
      throw new Error('network failed');
    });
    await expect(ensureReviewCredit(flow)).rejects.toThrow('network failed');
    expect(flow.pay).not.toHaveBeenCalled();
    expect(flow.create).not.toHaveBeenCalled();
  });
});
