import { computed, ref } from 'vue';
import type { Submission } from '@pitchcoach/shared';
import { getConfig } from './api';

export interface ReviewOffer {
  liveAvailable: boolean;
  paymentsEnabled: boolean;
  reviewPriceFen: number;
  supportContact: string;
}
export type OfferState = 'loading' | 'ready' | 'error';

/** Reject partial/old responses: unavailable pricing must never become a free offer. */
export function parseReviewOffer(value: unknown): ReviewOffer {
  const data = value as Partial<ReviewOffer> | undefined;
  if (!data || typeof data.liveAvailable !== 'boolean' ||
      typeof data.paymentsEnabled !== 'boolean' ||
      !Number.isSafeInteger(data.reviewPriceFen) || Number(data.reviewPriceFen) <= 0)
    throw new Error('服务信息暂不完整，请重新连接');
  return {
    liveAvailable: data.liveAvailable,
    paymentsEnabled: data.paymentsEnabled,
    reviewPriceFen: data.reviewPriceFen!,
    supportContact: typeof data.supportContact === 'string' ? data.supportContact.trim().slice(0, 500) : '',
  };
}
export const formatPrice = (fen: number) => `¥${(fen / 100).toFixed(2)}`;
export function offerDescription(state: OfferState, offer?: ReviewOffer) {
  if (state === 'loading') return '正在确认服务与价格…';
  if (state === 'error' || !offer) return '暂时无法确认服务与价格，请稍后重试';
  if (!offer.liveAvailable) return 'AI 评审暂时繁忙，请稍后重试';
  if (!offer.paymentsEnabled) return '当前环境未启用收费';
  return `${formatPrice(offer.reviewPriceFen)} / 次真实 AI 评审`;
}
export function reassessmentDescription(state: OfferState, offer?: ReviewOffer) {
  if (state !== 'ready' || !offer || !offer.liveAvailable)
    return '补充最新证据，下一步确认实际消耗；服务状态以填写页为准。';
  if (!offer.paymentsEnabled)
    return '当前环境未启用收费，可补充最新证据后再评一轮。结果可能变化。';
  return '新一轮使用 1 次额度；没有额度时按当时页面价格购买。补充最新证据，结果可能变化。';
}
export function useReviewOffer() {
  const state = ref<OfferState>('loading');
  const offer = ref<ReviewOffer>();
  let generation = 0;
  async function load(panel?: Pick<Submission, 'industry' | 'round' | 'preferences'>) {
    const request = ++generation;
    state.value = 'loading';
    offer.value = undefined;
    try {
      const current = parseReviewOffer(await getConfig(panel));
      if (request === generation) { offer.value = current; state.value = 'ready'; }
      return current;
    } catch {
      if (request === generation) { offer.value = undefined; state.value = 'error'; }
      return undefined;
    }
  }
  return { state, offer, load, description: computed(() => offerDescription(state.value, offer.value)) };
}
