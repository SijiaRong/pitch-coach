import type {
  ApiError,
  BillingStatus,
  JobStatus,
  Submission,
  WechatPaymentParams,
} from '@pitchcoach/shared';
import { hasAIDataConsent, isPrivacyRefusal } from './privacy';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
let token = '';
let expiresAt = 0;
let signingIn: Promise<void> | undefined;
export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  data?: unknown,
  authenticated = true,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  return new Promise((resolve, reject) =>
    uni.request({
      url: `${BASE}${path}`,
      method,
      data: data as Record<string, unknown>,
      timeout: 20000,
      header: {
        'Content-Type': 'application/json',
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300) resolve(result.data as T);
        else {
          const error = (result.data as { error?: ApiError })?.error;
          if (result.statusCode === 401) {
            token = '';
            expiresAt = 0;
            try {
              uni.removeStorageSync('pitchcoach:session:v1');
            } catch {
              /* Best effort. */
            }
          }
          reject(
            new ApiFailure(
              error?.code || 'API_ERROR',
              error?.message || '服务暂不可用，请稍后重试',
            ),
          );
        }
      },
      fail: () => reject(new ApiFailure('NETWORK_ERROR', '连接不到评估服务，请检查网络或稍后再试')),
    }),
  );
}

async function login() {
  let code: string | undefined;
  // #ifdef MP-WEIXIN
  if (!BASE || !BASE.startsWith('https://'))
    throw new ApiFailure('API_NOT_CONFIGURED', '请先为小程序配置 HTTPS 评估服务地址');
  code = await new Promise<string>((resolve, reject) =>
    uni.login({
      provider: 'weixin',
      success: (result) => resolve(result.code),
      fail: () => reject(new ApiFailure('LOGIN_FAILED', '微信登录失败，请稍后重试')),
    }),
  );
  // #endif
  const session = await request<{ token: string; expiresIn: number }>(
    '/api/session',
    'POST',
    { code },
    false,
  );
  token = session.token;
  expiresAt = Date.now() + (session.expiresIn - 60) * 1000;
}
export async function ensureSession(force = false) {
  if (!token) {
    try {
      const saved = uni.getStorageSync('pitchcoach:session:v1');
      if (
        saved &&
        typeof saved.token === 'string' &&
        saved.token.length < 1024 &&
        typeof saved.expiresAt === 'number' &&
        saved.expiresAt > Date.now()
      ) {
        token = saved.token;
        expiresAt = saved.expiresAt;
      }
    } catch {
      /* A session can remain memory-only when storage is unavailable. */
    }
  }
  if (!force && token && expiresAt > Date.now()) return;
  if (!signingIn)
    signingIn = login().finally(() => {
      signingIn = undefined;
    });
  await signingIn;
  try {
    uni.setStorageSync('pitchcoach:session:v1', { token, expiresAt });
  } catch {
    /* Best effort. */
  }
}

export async function evaluate(submission: Submission, requestKey?: string) {
  const checkConsent = () => {
    if (!submission.consent || !hasAIDataConsent())
      throw new ApiFailure('CONSENT_REQUIRED', '请先同意将项目资料交给 DeepSeek 进行评估');
  };
  checkConsent();
  await ensureSession();
  checkConsent();
  return request<JobStatus>(
    '/api/evaluations',
    'POST',
    submission,
    true,
    requestKey ? { 'Idempotency-Key': requestKey } : {},
  );
}
export const pollEvaluation = (id: string) => request<JobStatus>(`/api/evaluations/${id}`);
export const deleteEvaluation = (id: string) => request<void>(`/api/evaluations/${id}`, 'DELETE');
export const getConfig = (panel?: Pick<Submission, 'industry' | 'round' | 'preferences'>) =>
  request<{
    liveAvailable: boolean;
    requireWechat: boolean;
    paymentsEnabled: boolean;
    reviewPriceFen: number;
    supportContact?: string;
  }>(panel
    ? `/api/config?industry=${encodeURIComponent(panel.industry)}&round=${encodeURIComponent(panel.round)}&preferences=${encodeURIComponent(panel.preferences.join(','))}`
    : '/api/config', 'GET', undefined, false);

export async function getBillingStatus() {
  await ensureSession();
  return request<BillingStatus>('/api/billing/status');
}
export async function createPaymentOrder() {
  await ensureSession();
  return request<{ orderId: string; payment: WechatPaymentParams }>(
    '/api/billing/orders',
    'POST',
    {},
  );
}
export async function queryPaymentOrder(id: string) {
  await ensureSession();
  return request<{ order: { id: string; status: string }; billing: BillingStatus }>(
    `/api/billing/orders/${id}`,
  );
}
export async function payWithWechat(params: WechatPaymentParams): Promise<void> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) =>
    uni.requestPayment({
      provider: 'wxpay',
      ...params,
      success: () => resolve(),
      fail: (error) =>
        reject(
          new ApiFailure(
            'PAYMENT_NOT_COMPLETED',
            error.errMsg?.includes('cancel')
              ? '你已取消支付；若已扣款，请查询订单与额度'
              : '支付未确认，请查询订单与额度，勿重复付款',
          ),
        ),
    }),
  );
  // #endif
  // #ifndef MP-WEIXIN
  throw new ApiFailure('WECHAT_REQUIRED', '请在微信小程序中完成支付；浏览器可免费体验示例');
  // #endif
}

export async function uploadDocument(path: string): Promise<{ text: string; truncated: boolean }> {
  await ensureSession();
  return new Promise((resolve, reject) =>
    uni.uploadFile({
      url: `${BASE}/api/documents/extract`,
      filePath: path,
      name: 'file',
      formData: { consent: 'true' },
      header: { Authorization: `Bearer ${token}` },
      timeout: 25000,
      success(result) {
        try {
          const data = JSON.parse(result.data);
          if (result.statusCode >= 200 && result.statusCode < 300) resolve(data);
          else
            reject(
              new ApiFailure(
                data.error?.code || 'PARSE_FAILED',
                data.error?.message || '文件解析失败，请粘贴文字',
              ),
            );
        } catch {
          reject(new ApiFailure('PARSE_FAILED', '文件解析失败，请改用文字'));
        }
      },
      fail: () => reject(new ApiFailure('NETWORK_ERROR', '上传失败，请检查网络后重试')),
    }),
  );
}

export async function chooseDocument(): Promise<
  { path: string; name: string; size: number } | undefined
> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) =>
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'pptx', 'docx', 'txt', 'md'],
      success: (result) => {
        const file = result.tempFiles[0];
        resolve({ path: file.path, name: file.name, size: file.size });
      },
      fail: (error) => {
        if (isPrivacyRefusal(error))
          reject(new ApiFailure('PRIVACY_DECLINED', '未同意微信隐私指引，未选择或上传文件。仍可粘贴文字或体验示例。'));
        else if (error.errMsg?.includes('cancel')) resolve(undefined);
        else reject(new ApiFailure('FILE_ERROR', '无法选择文件，请稍后重试'));
      },
    }),
  );
  // #endif
  // #ifdef H5
  return new Promise((resolve, reject) =>
    uni.chooseFile({
      count: 1,
      type: 'all',
      extension: ['.pdf', '.pptx', '.docx', '.txt', '.md'],
      success: (result) => {
        const file = Array.isArray(result.tempFiles) ? result.tempFiles[0] : result.tempFiles;
        const path = 'path' in file ? file.path : (result.tempFilePaths as string[])[0];
        const name = 'name' in file && typeof file.name === 'string' ? file.name : 'bp.pdf';
        resolve({ path, name, size: file.size });
      },
      fail: (error) =>
        error.errMsg?.includes('cancel')
          ? resolve(undefined)
          : reject(new ApiFailure('FILE_ERROR', '无法选择文件，请重试')),
    }),
  );
  // #endif
}
