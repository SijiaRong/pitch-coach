export const PRIVACY_VERSION = '2026-10-19-sharing-v1';
export const OPERATOR_NAME =
  (import.meta.env.VITE_OPERATOR_NAME || '').trim() || '上海动御新媒体科技有限公司';
export const PRIVACY_CONTACT_EMAIL =
  (import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || '').trim() || 'support@actionandlink.com';
export const AI_RECIPIENT = {
  name: 'DeepSeek',
  operator: '杭州深度求索人工智能基础技术研究有限公司',
  privacyEmail: 'privacy@deepseek.com',
  policyUrl: 'https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html',
  termsUrl: 'https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html',
} as const;

const CONSENT_KEY = 'pitchcoach:ai-data-consent:v1';
interface ConsentRecord {
  version: string;
  operator: string;
  recipient: string;
  acceptedAt: number;
}
// Keep an explicit choice for this session even if device storage is unavailable.
let sessionChoice: ConsentRecord | false | undefined;

function isCurrentConsent(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ConsentRecord>;
  return (
    record.version === PRIVACY_VERSION &&
    record.operator === OPERATOR_NAME &&
    record.recipient === AI_RECIPIENT.operator &&
    typeof record.acceptedAt === 'number' &&
    Number.isFinite(record.acceptedAt) &&
    record.acceptedAt > 0
  );
}

export function hasAIDataConsent(): boolean {
  if (sessionChoice !== undefined) return isCurrentConsent(sessionChoice);
  try {
    return isCurrentConsent(uni.getStorageSync(CONSENT_KEY));
  } catch {
    return false;
  }
}

/** Returns whether the choice was also saved on this device. */
export function setAIDataConsent(accepted: boolean): boolean {
  sessionChoice = accepted
    ? {
        version: PRIVACY_VERSION,
        operator: OPERATOR_NAME,
        recipient: AI_RECIPIENT.operator,
        acceptedAt: Date.now(),
      }
    : false;
  try {
    if (sessionChoice) uni.setStorageSync(CONSENT_KEY, sessionChoice);
    else uni.removeStorageSync(CONSENT_KEY);
    return true;
  } catch {
    return false;
  }
}

interface PrivacyBridge {
  openPrivacyContract?: (options: { fail: () => void }) => void;
}
declare const wx: PrivacyBridge | undefined;

export function openWechatPrivacyContract() {
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({
      fail: () => uni.showToast({ title: '暂时无法打开微信隐私指引，请稍后重试', icon: 'none' }),
    });
    return;
  }
  // #endif
  uni.showToast({ title: '请在新版微信小程序中查看平台隐私指引', icon: 'none' });
}

export function isPrivacyRefusal(error: { errno?: number; errMsg?: string }): boolean {
  return (
    error.errno === 103 ||
    error.errno === 104 ||
    /privacy permission is not authorized|user deny privacy|user denied privacy/i.test(
      error.errMsg || '',
    )
  );
}
