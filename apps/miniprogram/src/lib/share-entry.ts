import { INDUSTRY_IDS, ROUND_IDS } from '@pitchcoach/shared';
import type { IndustryId, RoundId } from '@pitchcoach/shared';
export const FRIEND_TITLE = '你的项目，经得起几轮追问？';
export const TIMELINE_TITLE = '先看免费示例，再准备自己的项目路演。';
/** Always override WeChat's page-screenshot default, including on a private report. */
export const SHARE_COVER = '/static/brand/ai-toulema.png';
export type ShareSource = 'friend' | 'poster' | 'timeline';
export interface ShareEntry { from?: ShareSource; industry?: IndustryId; round?: RoundId }
/** Only these three fields may cross devices. Never copy query objects or report IDs. */
export function parseShareEntry(options?: Record<string, unknown>): ShareEntry {
  const entry: ShareEntry = {};
  if (typeof options?.from === 'string' && ['friend', 'poster', 'timeline'].includes(options.from)) entry.from = options.from as ShareSource;
  if (INDUSTRY_IDS.includes(options?.industry as IndustryId)) entry.industry = options!.industry as IndustryId;
  if (ROUND_IDS.includes(options?.round as RoundId)) entry.round = options!.round as RoundId;
  return entry;
}
export function shareQuery(from: ShareSource, context?: { industry?: unknown; round?: unknown }) {
  const safe = parseShareEntry({ from, industry: context?.industry, round: context?.round });
  return [`from=${safe.from}`, safe.industry ? `industry=${safe.industry}` : '', safe.round ? `round=${safe.round}` : ''].filter(Boolean).join('&');
}
export const sharePath = (from: ShareSource, context?: { industry?: unknown; round?: unknown }) =>
  `/pages/index/index?${shareQuery(from, context)}`;
export const friendShareMessage = (context?: { industry?: unknown; round?: unknown }) => ({
  title: FRIEND_TITLE,
  path: sharePath('friend', context),
  imageUrl: SHARE_COVER,
});
export const timelineShareMessage = (context?: { industry?: unknown; round?: unknown }) => ({
  title: TIMELINE_TITLE,
  query: shareQuery('timeline', context),
  imageUrl: SHARE_COVER,
});
export const ABOUT_SECTIONS = ['billing', 'orders', 'privacy', 'storage', 'refund', 'scoring', 'sharing'] as const;
export type AboutSection = typeof ABOUT_SECTIONS[number];
export const aboutPath = (section: AboutSection) => `/pages/about/index?section=${section}`;
