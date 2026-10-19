import {
  createDemoReport,
  DEFAULT_UNLOCK_FEN,
  EXAMPLES,
  publicReportCopy,
  SERVICE_FEE_RATE_BPS,
} from '@pitchcoach/shared';
import type {
  IndustryId,
  PreferenceId,
  PrivateProjectPack,
  PublishedProject,
  RoundId,
} from '@pitchcoach/shared';

export interface PublicationLink {
  reportId: string;
  projectId: string;
  example?: IndustryId;
  round?: RoundId;
  priceFen?: number;
  anonymous: boolean;
  preferences?: PreferenceId[];
  unlockEnabled?: boolean;
  tipsEnabled?: boolean;
}
const KEY = 'pitchcoach:publications:v1';
const links = () => {
  try {
    return (uni.getStorageSync(KEY) || []) as PublicationLink[];
  } catch {
    return [];
  }
};
export const findPublication = (reportId: string) =>
  links().find((item) => item.reportId === reportId);
export function savePublication(value: PublicationLink) {
  uni.setStorageSync(
    KEY,
    [value, ...links().filter((item) => item.reportId !== value.reportId)].slice(0, 100),
  );
}
export function removePublication(projectId: string) {
  uni.setStorageSync(
    KEY,
    links().filter((item) => item.projectId !== projectId),
  );
}
export const projectPath = (value: PublicationLink) =>
  value.example
    ? `/pages/project/index?example=${value.example}&round=${value.round || 'angel'}&price=${value.priceFen || DEFAULT_UNLOCK_FEN}&anonymous=${value.anonymous ? 1 : 0}&unlock=${value.unlockEnabled !== false ? 1 : 0}&tips=${value.tipsEnabled !== false ? 1 : 0}${value.preferences ? `&preferences=${value.preferences.join(',')}` : ''}`
    : `/pages/project/index?share=${value.projectId}`;
export function demoProject(
  industry: IndustryId = 'ai',
  round: RoundId = 'angel',
  priceFen = DEFAULT_UNLOCK_FEN,
  anonymous = true,
  preferences?: readonly PreferenceId[],
  offers?: { unlockEnabled?: boolean; tipsEnabled?: boolean },
): PublishedProject {
  const report = createDemoReport(industry, 'sharp', round, preferences);
  return {
    id: `demo-${industry}-${round}`,
    mode: 'demo',
    report: publicReportCopy(report, anonymous),
    anonymous,
    unlockEnabled: offers?.unlockEnabled ?? true,
    unlockPriceFen: priceFen,
    tipsEnabled: offers?.tipsEnabled ?? true,
    createdAt: report.createdAt,
    revision: 1,
    views: 0,
    referrals: 0,
    paymentAvailable: false,
    shareCodeAvailable: false,
    purchasableUnlock: false,
    purchasableTipPricesFen: [],
    serviceFeeRateBps: SERVICE_FEE_RATE_BPS,
  };
}
export function demoPrivatePack(industry: IndustryId = 'ai'): PrivateProjectPack {
  return {
    overview: `【虚构演示资料，不对应真实项目】\n${EXAMPLES[industry].description}\n${EXAMPLES[industry].bp}`,
    contactName: '示例项目负责人（虚构）',
    contactChannel: 'wechat',
    contactValue: 'demo_pitchcoach（示例，不可联系）',
  };
}
