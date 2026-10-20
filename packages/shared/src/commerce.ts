import { z } from 'zod';
import type { EvaluationReport } from './schema';
import { INDUSTRY_IDS, ROUND_IDS, PREFERENCE_IDS } from './catalog';
import type { IndustryId, PreferenceId, RoundId } from './catalog';

export const PRICE_PRESETS_FEN = [888, 8888, 88888, 888888] as const;
export const DEFAULT_UNLOCK_FEN = 8888;
export const MAX_PRICE_FEN = 9999999;
export const SERVICE_FEE_RATE_BPS = 500;
export const GIFT_IDS = ['spark', 'booster', 'rocket', 'starship'] as const;
export type GiftId = (typeof GIFT_IDS)[number];
export const GIFTS = [
  { id: 'spark', name: '火花', symbol: '✦', amountFen: 888, caption: '为好想法点亮第一束光' },
  { id: 'booster', name: '助推器', symbol: '⚡', amountFen: 8888, caption: '给下一步多一点能量' },
  { id: 'rocket', name: '火箭', symbol: '🚀', amountFen: 88888, caption: '让这个项目再向前一步' },
  {
    id: 'starship',
    name: '星舰',
    symbol: '🛸',
    amountFen: 888888,
    caption: '陪一个大胆的想法远航',
  },
] as const;
export const getGift = (id: GiftId | undefined) => GIFTS.find((gift) => gift.id === id);
/** Round each order's fee to the nearest fen, half up. Never calculate from list price. */
export function revenueSplit(
  receiptFen: number,
  refundFen: number,
  rateBps = SERVICE_FEE_RATE_BPS,
) {
  if (
    ![receiptFen, refundFen, rateBps].every(Number.isSafeInteger) ||
    receiptFen < 0 ||
    receiptFen > MAX_PRICE_FEN ||
    refundFen < 0 ||
    refundFen > receiptFen ||
    rateBps < 0 ||
    rateBps > 10000
  )
    return;
  const netReceiptsFen = receiptFen - refundFen;
  const platformFeeFen = Math.floor((netReceiptsFen * rateBps + 5000) / 10000);
  return { netReceiptsFen, platformFeeFen, projectShareFen: netReceiptsFen - platformFeeFen };
}
export const formatPrice = (fen: number) =>
  `${Math.floor(fen / 100)}.${String(fen % 100).padStart(2, '0')}`;
export function parsePrice(value: string): number | undefined {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(text)) return undefined;
  const [yuan, cents = ''] = text.split('.');
  const fen = Number(yuan) * 100 + Number(cents.padEnd(2, '0'));
  return fen >= 1 && fen <= MAX_PRICE_FEN ? fen : undefined;
}
export const shareIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export interface DemoScene {
  industry: IndustryId;
  round: RoundId;
  priceFen: number;
  anonymous: boolean;
  preferences: readonly PreferenceId[];
  unlockEnabled?: boolean;
  tipsEnabled?: boolean;
}
export function makeDemoScene(value: DemoScene): string {
  const offers = (value.unlockEnabled !== false ? 1 : 0) + (value.tipsEnabled !== false ? 2 : 0);
  return `d~${value.industry}~${value.round}~${value.priceFen}~${value.anonymous ? 1 : 0}~${value.preferences.map((id) => PREFERENCE_IDS.indexOf(id)).join('')}${offers}`;
}
export function readDemoScene(value: string): DemoScene | undefined {
  const [prefix, industry, round, price, anonymous, preferences, extra] = value.split('~');
  if (
    prefix !== 'd' ||
    extra !== undefined ||
    !INDUSTRY_IDS.includes(industry as IndustryId) ||
    !ROUND_IDS.includes(round as RoundId) ||
    !/^\d{1,7}$/.test(price || '') ||
    Number(price) < 1 ||
    !['0', '1'].includes(anonymous) ||
    !/^\d{3}[0-3]?$/.test(preferences || '')
  )
    return;
  const ids = [...preferences.slice(0, 3)].map((index) => PREFERENCE_IDS[Number(index)]);
  if (ids.some((id) => !id) || new Set(ids).size !== 3) return;
  return {
    industry: industry as IndustryId,
    round: round as RoundId,
    priceFen: Number(price),
    anonymous: anonymous === '1',
    preferences: ids,
    unlockEnabled: (Number(preferences[3] ?? 3) & 1) !== 0,
    tipsEnabled: (Number(preferences[3] ?? 3) & 2) !== 0,
  };
}
export const privatePackSchema = z.object({
  overview: z.string().trim().min(30, '请补充至少 30 字的完整项目资料').max(50000),
  contactName: z.string().trim().min(1, '请填写项目方联系人').max(40),
  contactChannel: z.enum(['wechat', 'phone', 'email']),
  contactValue: z.string().trim().min(3, '请填写有效的联系方式').max(128),
});
export type PrivateProjectPack = z.infer<typeof privatePackSchema>;
export const publishProjectSchema = z
  .object({
    report: z.custom<EvaluationReport>((value) =>
      Boolean(
        value &&
        typeof value === 'object' &&
        (value as EvaluationReport).version === 1 &&
        Array.isArray((value as EvaluationReport).investors),
      ),
    ),
    anonymous: z.boolean().default(true),
    publicReportConsent: z.literal(true, { error: '请先确认公开完整评估报告' }),
    unlockEnabled: z.boolean().default(false),
    unlockPriceFen: z.number().int().min(1).max(MAX_PRICE_FEN).default(DEFAULT_UNLOCK_FEN),
    privatePack: privatePackSchema.optional(),
    privateDisclosureConsent: z.boolean().default(false),
    tipsEnabled: z.boolean().default(false),
    serviceFeeConsent: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if ((value.unlockEnabled || value.tipsEnabled) && !value.serviceFeeConsent)
      ctx.addIssue({
        code: 'custom',
        message: '请确认平台收款及 5% 服务费规则',
        path: ['serviceFeeConsent'],
      });
    if (value.unlockEnabled && (!value.privatePack || !value.privateDisclosureConsent))
      ctx.addIssue({
        code: 'custom',
        message: '开启解锁前，请补充资料、联系方式并确认披露范围',
        path: ['privatePack'],
      });
  });
export type PublishProjectInput = z.infer<typeof publishProjectSchema>;
export type ViewerRole = 'investor' | 'entrepreneur' | 'supporter';
export interface PublishedProject {
  id: string;
  mode: 'live' | 'demo';
  report: EvaluationReport;
  anonymous: boolean;
  unlockEnabled: boolean;
  unlockPriceFen: number;
  tipsEnabled: boolean;
  createdAt: string;
  revision: number;
  views: number;
  referrals: number;
  paymentAvailable: boolean;
  shareCodeAvailable: boolean;
  purchasableUnlock: boolean;
  purchasableTipPricesFen: number[];
  serviceFeeRateBps: number;
}
export const createOrderSchema = z
  .object({
    kind: z.enum(['unlock', 'gift']),
    giftId: z.enum(GIFT_IDS).optional(),
    amountFen: z.number().int().min(1).max(MAX_PRICE_FEN),
    expectedRevision: z.number().int().min(1),
    role: z.enum(['investor', 'entrepreneur', 'supporter']),
    contact: z.string().trim().max(128).default(''),
    message: z.string().trim().max(300).default(''),
    shareContactConsent: z.boolean().default(false),
    purchaseConsent: z.literal(true, { error: '请先确认本次购买或支持说明' }),
    idempotencyKey: z.uuid(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'unlock' && value.role !== 'investor')
      ctx.addIssue({ code: 'custom', message: '资料解锁面向自我声明的投资人', path: ['role'] });
    if (value.contact && !value.shareContactConsent)
      ctx.addIssue({
        code: 'custom',
        message: '留下联系方式前，请同意仅向项目方提供',
        path: ['contact'],
      });
    if (
      value.kind === 'gift' &&
      (!getGift(value.giftId) || getGift(value.giftId)!.amountFen !== value.amountFen)
    )
      ctx.addIssue({
        code: 'custom',
        message: '请重新选择礼物，价格以礼物目录为准',
        path: ['giftId'],
      });
    if (value.kind === 'unlock' && value.giftId)
      ctx.addIssue({ code: 'custom', message: '资料解锁不能附带礼物', path: ['giftId'] });
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export interface CommerceOrder {
  id: string;
  projectId: string;
  kind: 'unlock' | 'gift' | 'tip';
  gift?: { id: GiftId; name: string };
  amountFen: number;
  status: 'pending' | 'paid' | 'refunded' | 'closed';
  mode: 'live' | 'demo';
  createdAt: string;
  paidAt?: string;
  serviceFeeRateBps: number;
}
export interface VirtualPayParameters {
  mode: 'short_series_goods';
  signData: string;
  paySig: string;
  signature: string;
}
export type ProjectOwnerOrder = CommerceOrder & { contact: string; message: string };
export interface ProjectOwnerOrderPage {
  orders: ProjectOwnerOrder[];
  nextCursor?: string;
}
export interface ProjectOwnerData {
  project: PublishedProject;
  active: boolean;
  orders: ProjectOwnerOrder[];
  /** Present when older orders exist; pass it to the owner orders endpoint for the next page. */
  nextCursor?: string;
  grossPaidFen: number;
  refundFen: number;
  verifiedReceiptsFen: number;
  netReceiptsFen: number;
  platformFeeFen: number;
  projectShareFen: number;
  channelFeeFen: number;
  unreconciledOrders: number;
  channelFeePendingOrders: number;
  settlement: 'pending_external';
}

/** Copy only the report selected for public disclosure. Never serialize a server receipt. */
export function publicReportCopy(report: EvaluationReport, anonymous: boolean): EvaluationReport {
  const { publicationProof: _proof, ...publicReport } = JSON.parse(
    JSON.stringify(report),
  ) as EvaluationReport;
  publicReport.id = '';
  if (anonymous) publicReport.projectName = '某创业项目';
  return publicReport;
}
