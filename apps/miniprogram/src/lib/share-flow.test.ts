import { describe, expect, it, vi } from 'vitest';
import { openPosterShare } from './share-flow';
import type { ImageShareBridge } from './share-flow';

describe('朋友圈优先的海报分享', () => {
  it('优先打开图片分享菜单，公开入口仅为首页，不附带报告 ID', async () => {
    const showMenu = vi.fn<NonNullable<ImageShareBridge['showMenu']>>((options) =>
      options.success(),
    );
    const preview = vi.fn();
    expect(await openPosterShare('wxfile://poster.png', { showMenu, preview })).toBe('opened');
    expect(showMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'wxfile://poster.png',
        entrancePath: '/pages/index/index',
        needShowEntrance: true,
      }),
    );
    expect(preview).not.toHaveBeenCalled();
  });
  it('取消分享不会重试、打开预览或执行保存', async () => {
    const preview = vi.fn();
    const showMenu = vi.fn<NonNullable<ImageShareBridge['showMenu']>>((options) =>
      options.fail({ errMsg: 'showShareImageMenu:fail cancel' }),
    );
    expect(await openPosterShare('wxfile://poster.png', { showMenu, preview })).toBe('cancelled');
    expect(showMenu).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
  });
  it('不支持或菜单失败时仅打开预览，保留用户主动保存的选择', async () => {
    for (const showMenu of [
      undefined,
      ((options) => options.fail({ errMsg: 'not supported' })) as ImageShareBridge['showMenu'],
      (() => {
        throw new Error('simulator');
      }) as ImageShareBridge['showMenu'],
    ]) {
      const preview = vi.fn();
      expect(await openPosterShare('wxfile://poster.png', { showMenu, preview })).toBe('preview');
      expect(preview).toHaveBeenCalledExactlyOnceWith('wxfile://poster.png');
    }
  });
  it('允许随机公开项目入口，拒绝本机报告编号和外部地址', async () => {
    for (const path of [
      '/pages/project/index?share=abcdefghijklmnopqrstuv',
      '/pages/report/index?id=private-report',
      'https://example.invalid',
    ]) {
      const showMenu = vi.fn<NonNullable<ImageShareBridge['showMenu']>>((options) =>
        options.success(),
      );
      await openPosterShare('wxfile://poster.png', { showMenu, preview: vi.fn() }, path);
      expect(showMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          entrancePath: path.includes('?share=') ? path : '/pages/index/index',
        }),
      );
    }
  });
});
