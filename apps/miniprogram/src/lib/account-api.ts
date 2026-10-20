import type {
  AccountInfo,
  AccountSettings,
  CloudReportSummary,
  EvaluationReport,
} from '@pitchcoach/shared';
import { ApiFailure, ensureSession, request } from './api';
export interface AccountConfig {
  cloudAvailable: boolean;
  wechatLoginAvailable: boolean;
}
export const getAccountConfig = () =>
  request<AccountConfig>('/api/account/config', 'GET', undefined, false);
async function own<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', input?: unknown) {
  await ensureSession();
  return request<T>(path, method, input);
}
export const getAccount = () => own<AccountInfo>('/api/me');
export const updateAccount = (input: AccountSettings) => own<AccountInfo>('/api/me', 'POST', input);
export const listCloudReports = () => own<CloudReportSummary[]>('/api/me/reports');
export const getCloudReport = (id: string) =>
  own<EvaluationReport>(`/api/me/reports/${encodeURIComponent(id)}`);
export const removeCloudReport = (id: string) =>
  own<void>(`/api/me/reports/${encodeURIComponent(id)}`, 'DELETE');
export const saveCloudReport = (report: EvaluationReport) =>
  own<{ saved: true }>('/api/me/reports', 'POST', { report });
export async function loginAndSync(): Promise<AccountInfo> {
  // #ifdef H5
  throw new ApiFailure('WECHAT_LOGIN_REQUIRED', '请在微信小程序中登录；网页可先查看示例和本机报告');
  // #endif
  // #ifdef MP-WEIXIN
  await ensureSession(true);
  return updateAccount({ cloudSyncEnabled: true, cloudStorageConsent: true });
  // #endif
}
