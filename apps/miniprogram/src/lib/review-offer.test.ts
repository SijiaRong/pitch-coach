import { describe, expect, it, vi } from 'vitest';
import { getConfig } from './api';
import { formatPrice, offerDescription, parseReviewOffer, reassessmentDescription, useReviewOffer } from './review-offer';
vi.mock('./api', () => ({ getConfig: vi.fn() }));
const response = { liveAvailable: true, paymentsEnabled: true, reviewPriceFen: 299, supportContact: ' actual-contact ' };
describe('公开报价和服务状态', () => {
  it('只用后台报价，允许替身价格而非前端回退常量', () => {
    const offer = parseReviewOffer(response);
    expect(formatPrice(offer.reviewPriceFen)).toBe('¥2.99');
    expect(offerDescription('ready', offer)).toContain('¥2.99');
    expect(offer.supportContact).toBe('actual-contact');
  });
  it('报价字段缺失/异常不能被解释为未收费', () => {
    for (const bad of [undefined, {}, { ...response, paymentsEnabled: undefined }, { ...response, liveAvailable: 'yes' }, ...[undefined, 0, -1, 2.99, NaN, Infinity, '188'].map((price) => ({ ...response, reviewPriceFen: price }))])
      expect(() => parseReviewOffer(bad)).toThrow();
  });
  it('失败或加载忽略旧报价，不再引导去看示例', () => {
    for (const state of ['loading', 'error'] as const) {
      expect(offerDescription(state, response)).not.toContain('2.99');
      expect(offerDescription(state, response)).not.toContain('未启用收费');
      expect(offerDescription(state, response)).not.toContain('示例');
    }
    expect(offerDescription('ready', { ...response, liveAvailable: false, paymentsEnabled: false })).toContain('稍后重试');
    expect(offerDescription('ready', { ...response, paymentsEnabled: false })).toBe('当前环境未启用收费');
  });
  it('没有有效客服字段就不给出猜测的联系地址', () => {
    expect(parseReviewOffer({ ...response, supportContact: undefined }).supportContact).toBe('');
    expect(parseReviewOffer({ ...response, supportContact: { email: 'fake' } }).supportContact).toBe('');
  });
  it('复评文案跟随收费状态，未知状态不提前要求购买或用额度', () => {
    expect(reassessmentDescription('ready', response)).toContain('使用 1 次额度');
    const free = reassessmentDescription('ready', { ...response, paymentsEnabled: false });
    expect(free).toContain('当前环境未启用收费');
    expect(free).not.toMatch(/购买|使用 1 次额度/);
    for (const copy of [reassessmentDescription('loading', response), reassessmentDescription('error', response), reassessmentDescription('ready'), reassessmentDescription('ready', { ...response, liveAvailable: false })]) {
      expect(copy).toContain('下一步确认实际消耗');
      expect(copy).not.toMatch(/购买|使用 1 次额度|未启用收费/);
    }
  });
  it('缓存页重新获取时清除旧报价，晚到的旧请求不能覆盖最新报价', async () => {
    const api = vi.mocked(getConfig);
    api.mockResolvedValueOnce({ ...response, requireWechat: false, reviewPriceFen: 188 });
    const current = useReviewOffer();
    await current.load();
    expect(current.offer.value?.reviewPriceFen).toBe(188);
    let resolveOld!: (value: Awaited<ReturnType<typeof getConfig>>) => void;
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    api.mockResolvedValueOnce({ ...response, requireWechat: false, reviewPriceFen: 299 });
    const old = current.load();
    expect(current.state.value).toBe('loading');
    expect(current.offer.value).toBeUndefined();
    await current.load();
    expect(current.offer.value?.reviewPriceFen).toBe(299);
    resolveOld({ ...response, requireWechat: false, reviewPriceFen: 188 });
    await old;
    expect(current.state.value).toBe('ready');
    expect(current.offer.value?.reviewPriceFen).toBe(299);
  });
});
