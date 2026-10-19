import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stored: Map<string, unknown>;
beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('uni', {
    getStorageSync: vi.fn((key: string) => stored.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => stored.set(key, value)),
    removeStorageSync: vi.fn((key: string) => stored.delete(key)),
    showToast: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('AI 资料处理同意', () => {
  it('首次不默认同意，主动同意后在重新打开时记住相同版本的选择', async () => {
    let privacy = await import('./privacy');
    expect(privacy.hasAIDataConsent()).toBe(false);
    expect(privacy.setAIDataConsent(true)).toBe(true);
    vi.resetModules();
    privacy = await import('./privacy');
    expect(privacy.hasAIDataConsent()).toBe(true);
    expect([...stored.values()][0]).toEqual({
      version: privacy.PRIVACY_VERSION,
      operator: privacy.OPERATOR_NAME,
      recipient: privacy.AI_RECIPIENT.operator,
      acceptedAt: expect.any(Number),
    });
  });

  it.each([
    ['version', 'old-policy'],
    ['recipient', 'another-provider'],
    ['operator', 'another-company'],
    ['acceptedAt', null],
  ])('说明或主体信息不匹配时要求重新同意：%s', async (field, changedValue) => {
    const privacy = await import('./privacy');
    privacy.setAIDataConsent(true);
    const [key, record] = [...stored.entries()][0];
    stored.set(key, { ...(record as object), [field]: changedValue });
    vi.resetModules();
    expect((await import('./privacy')).hasAIDataConsent()).toBe(false);
  });

  it('撤回选择跨页面和重新打开生效，且不删除本机报告', async () => {
    const privacy = await import('./privacy');
    const reports = [{ id: 'private-report' }];
    stored.set('pitchcoach:reports:v1', reports);
    privacy.setAIDataConsent(true);
    expect(privacy.setAIDataConsent(false)).toBe(true);
    expect(privacy.hasAIDataConsent()).toBe(false);
    vi.resetModules();
    expect((await import('./privacy')).hasAIDataConsent()).toBe(false);
    expect(stored.get('pitchcoach:reports:v1')).toEqual(reports);
  });

  it('设备存储不可用时不默认同意，仍尊重本次使用的明确选择', async () => {
    vi.stubGlobal('uni', {
      getStorageSync: () => { throw new Error('storage unavailable'); },
      setStorageSync: () => { throw new Error('storage unavailable'); },
      removeStorageSync: () => { throw new Error('storage unavailable'); },
    });
    const privacy = await import('./privacy');
    expect(privacy.hasAIDataConsent()).toBe(false);
    expect(privacy.setAIDataConsent(true)).toBe(false);
    expect(privacy.hasAIDataConsent()).toBe(true);
    expect(privacy.setAIDataConsent(false)).toBe(false);
    expect(privacy.hasAIDataConsent()).toBe(false);
  });
});

describe('微信隐私指引', () => {
  it('只在主动打开时调用平台协议，不在加载时触发授权或弹窗', async () => {
    const openPrivacyContract = vi.fn();
    vi.stubGlobal('wx', { openPrivacyContract });
    const privacy = await import('./privacy');
    expect(openPrivacyContract).not.toHaveBeenCalled();
    expect(uni.showToast).not.toHaveBeenCalled();
    privacy.openWechatPrivacyContract();
    expect(openPrivacyContract).toHaveBeenCalledOnce();
  });

  it('区分用户拒绝授权与后台未声明接口，避免把配置错误说成用户拒绝', async () => {
    const { isPrivacyRefusal } = await import('./privacy');
    expect(isPrivacyRefusal({ errno: 103 })).toBe(true);
    expect(isPrivacyRefusal({ errno: 104 })).toBe(true);
    expect(isPrivacyRefusal({ errMsg: 'chooseMessageFile:fail privacy permission is not authorized' })).toBe(true);
    expect(isPrivacyRefusal({ errno: 112, errMsg: 'api scope is not declared in the privacy agreement' })).toBe(false);
    expect(isPrivacyRefusal({ errMsg: 'chooseMessageFile:fail cancel' })).toBe(false);
  });
});
