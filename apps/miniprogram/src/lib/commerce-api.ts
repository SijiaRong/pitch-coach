import type {
  CommerceOrder,
  CreateOrderInput,
  PrivateProjectPack,
  ProjectOwnerData,
  ProjectOwnerOrderPage,
  PublishedProject,
  PublishProjectInput,
  VirtualPayParameters,
  DemoScene,
} from '@pitchcoach/shared';
import { makeDemoScene } from '@pitchcoach/shared';
import { ApiFailure, ensureSession, request } from './api';
import type { PosterEntry } from './poster';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export interface CommerceConfig {
  sharingAvailable: boolean;
  paymentAvailable: boolean;
  miniCodeAvailable: boolean;
  webCodeAvailable: boolean;
  webCodeLocal: boolean;
}
async function secured<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown) {
  await ensureSession();
  return request<T>(path, method, body);
}
export const commerceConfig = () =>
  request<CommerceConfig>('/api/commerce/config', 'GET', undefined, false);
export const publishProject = (input: PublishProjectInput) =>
  secured<PublishedProject>('/api/projects', 'POST', input);
export const getProject = (id: string) =>
  request<PublishedProject>(`/api/projects/${encodeURIComponent(id)}`, 'GET', undefined, false);
export const getAccess = (id: string) =>
  secured<{ isOwner: boolean; unlocked: boolean; privatePack?: PrivateProjectPack }>(
    `/api/projects/${id}/access`,
  );
export const getOwnerProject = (id: string) =>
  secured<ProjectOwnerData>(`/api/projects/${id}/owner`);
export const getOwnerOrders = (id: string, cursor: string) =>
  secured<ProjectOwnerOrderPage>(
    `/api/projects/${id}/owner/orders?cursor=${encodeURIComponent(cursor)}`,
  );
export const unpublishProject = (id: string) => secured<void>(`/api/projects/${id}`, 'DELETE');
export const changePrice = (
  id: string,
  input: {
    expectedRevision: number;
    unlockPriceFen: number;
    tipsEnabled: boolean;
    serviceFeeConsent: boolean;
  },
) => secured<PublishedProject>(`/api/projects/${id}/settings`, 'POST', input);
export const myCommerce = () =>
  secured<{ projects: (PublishedProject & { active: boolean })[]; orders: CommerceOrder[] }>(
    '/api/commerce/mine',
  );
export const getOrder = (id: string) => secured<CommerceOrder>(`/api/orders/${id}`);
export const getOrderMaterial = (id: string) =>
  secured<PrivateProjectPack>(`/api/orders/${id}/material`);
export const createOrder = async (id: string, input: CreateOrderInput) => {
  await ensureSession(true);
  return request<{ order: CommerceOrder; payment?: VirtualPayParameters }>(
    `/api/projects/${id}/orders`,
    'POST',
    input,
  );
};
export async function projectCodePath(id: string): Promise<string> {
  const config = await commerceConfig();
  let format = config.miniCodeAvailable ? 'mini' : 'web';
  // #ifdef MP-WEIXIN
  format = 'mini';
  // #endif
  return new Promise((resolve, reject) =>
    uni.getImageInfo({
      src: `${BASE}/api/projects/${id}/code.png?format=${format}`,
      success: (result) => resolve(result.path),
      fail: () =>
        reject(
          new ApiFailure(
            'SHARE_CODE_UNAVAILABLE',
            '扫码入口暂不可用，请确认官方小程序码或公开网页服务已配置',
          ),
        ),
    }),
  );
}
export async function demoCodeEntry(scene: DemoScene): Promise<PosterEntry> {
  const config = await commerceConfig();
  let format = config.miniCodeAvailable ? 'mini' : 'web';
  // #ifdef MP-WEIXIN
  format = 'mini';
  // #endif
  if (
    (format === 'mini' && !config.miniCodeAvailable) ||
    (format === 'web' && !config.webCodeAvailable)
  )
    throw new ApiFailure('SHARE_CODE_UNAVAILABLE', '示例扫码入口尚未配置');
  return new Promise((resolve, reject) =>
    uni.getImageInfo({
      src: `${BASE}/api/demo/code.png?format=${format}&scene=${encodeURIComponent(makeDemoScene(scene))}`,
      success: (result) =>
        resolve({
          codePath: result.path,
          label:
            format === 'web' && config.webCodeLocal
              ? '虚构演示 · 仅本机预览'
              : '虚构演示 · 扫码体验',
        }),
      fail: () => reject(new ApiFailure('SHARE_CODE_UNAVAILABLE', '示例扫码入口生成失败')),
    }),
  );
}
declare const wx: {
  requestVirtualPayment?: (
    options: VirtualPayParameters & {
      success: () => void;
      fail: (error: { errMsg?: string }) => void;
    },
  ) => void;
  getAppBaseInfo?: () => { version: string };
  getDeviceInfo?: () => { platform: string };
};
function versionAtLeast(value: string, required: string) {
  const a = value.split('.').map(Number),
    b = required.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
export async function launchPayment(payment: VirtualPayParameters): Promise<boolean> {
  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined' || typeof wx.requestVirtualPayment !== 'function')
    throw new ApiFailure('PAYMENT_UNSUPPORTED', '请使用支持虚拟支付的新版手机微信');
  if (
    wx.getDeviceInfo?.().platform === 'ios' &&
    !versionAtLeast(wx.getAppBaseInfo?.().version || '0', '8.0.68')
  )
    throw new ApiFailure('PAYMENT_UNSUPPORTED', '请升级微信后重试，当前 iOS 微信版本暂不支持');
  return new Promise((resolve, reject) =>
    wx.requestVirtualPayment!({
      ...payment,
      success: () => resolve(true),
      fail: (error) =>
        /cancel/i.test(error.errMsg || '')
          ? resolve(false)
          : reject(
              new ApiFailure(
                'PAYMENT_FAILED',
                '支付未完成，未确认前不会开放资料；可在我的订单核对状态',
              ),
            ),
    }),
  );
  // #endif
  // #ifdef H5
  throw new ApiFailure('PAYMENT_UNSUPPORTED', '真实付款请在手机微信小程序中完成');
  // #endif
}
