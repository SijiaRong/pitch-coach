import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Submission } from '@pitchcoach/shared';

const submission: Submission = {
  projectName: '脱敏的测试项目',
  industry: 'ai',
  round: 'angel',
  preferences: ['technology', 'growth', 'financial'],
  stage: '已有原型',
  description: '为企业提供资料整理工具，当前处于产品原型验证阶段，尚未获得真实付费数据。',
  bpText: '',
  tone: 'balanced',
  consent: true,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('真实评估发送前的同意校验', () => {
  it('没有当前版本的主动同意时，不发起微信登录或网络请求', async () => {
    const request = vi.fn();
    const login = vi.fn();
    vi.stubGlobal('uni', { getStorageSync: () => undefined, request, login });
    const { evaluate } = await import('./api');
    await expect(evaluate(submission)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(login).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('登录等待期间撤回同意后，不继续发送项目资料', async () => {
    type RequestOptions = { url: string; success: (value: unknown) => void };
    let sessionRequest: RequestOptions | undefined;
    const request = vi.fn((options: RequestOptions) => { sessionRequest = options; });
    vi.stubGlobal('uni', {
      getStorageSync: () => undefined,
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
      login: (options: { success: (value: { code: string }) => void }) => options.success({ code: 'test-code' }),
      request,
    });
    const privacy = await import('./privacy');
    privacy.setAIDataConsent(true);
    const { evaluate } = await import('./api');
    const pending = evaluate(submission);
    await vi.waitFor(() => expect(sessionRequest?.url).toBe('https://api.example.com/api/session'));
    privacy.setAIDataConsent(false);
    sessionRequest!.success({ statusCode: 200, data: { token: 'test-token', expiresIn: 7200 } });
    await expect(pending).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('主动同意后正常提交，不增加额外授权网络请求', async () => {
    const request = vi.fn((options: { url: string; success: (value: unknown) => void }) => {
      options.success({
        statusCode: options.url.endsWith('/api/session') ? 200 : 202,
        data: options.url.endsWith('/api/session')
          ? { token: 'test-token', expiresIn: 7200 }
          : { id: 'job-id', status: 'running' },
      });
    });
    vi.stubGlobal('uni', {
      getStorageSync: () => undefined,
      setStorageSync: vi.fn(),
      login: (options: { success: (value: { code: string }) => void }) => options.success({ code: 'test-code' }),
      request,
    });
    (await import('./privacy')).setAIDataConsent(true);
    const { evaluate } = await import('./api');
    expect(await evaluate(submission)).toMatchObject({ id: 'job-id', status: 'running' });
    expect(request.mock.calls.map(([options]) => options.url)).toEqual([
      'https://api.example.com/api/session',
      'https://api.example.com/api/evaluations',
    ]);
  });
});
