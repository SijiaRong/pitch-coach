import { INDUSTRY_IDS, ROUND_IDS } from './catalog';
import type { IndustryId, RoundId } from './catalog';

/**
 * Poster invite codes: a WeChat mini code that opens the home page with the sharer's
 * industry and round pre-selected. The scene carries no report, project or user data.
 */
export interface InviteScene {
  industry: IndustryId;
  round: RoundId;
}
export function makeInviteScene(value: InviteScene): string {
  return `i.${value.industry}.${value.round}`;
}
export function readInviteScene(value: unknown): InviteScene | undefined {
  if (typeof value !== 'string' || value.length > 32) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  const match = /^i\.([a-z]+)\.([a-z-]+)$/.exec(decoded);
  if (!match) return undefined;
  const [, industry, round] = match;
  if (!INDUSTRY_IDS.includes(industry as IndustryId) || !ROUND_IDS.includes(round as RoundId))
    return undefined;
  return { industry: industry as IndustryId, round: round as RoundId };
}
