import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoReport } from '@pitchcoach/shared';
import { drawPoster, POSTER_HEIGHT, POSTER_WIDTH } from './poster';

afterEach(() => vi.unstubAllGlobals());

describe('公开海报绘制', () => {
  it('四类诊断全部标识，默认不绘制项目名称、模型金句或原文，导出高清长图', async () => {
    const drawn: { text: string; y: number }[] = [];
    let font = 10;
    const ctx = {
      setFillStyle: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      setFontSize: (size: number) => {
        font = size;
      },
      measureText: (value: string) => ({ width: [...value].length * font }),
      fillText: (text: string, _x: number, y: number) => drawn.push({ text, y }),
      draw: (_reserve: boolean, done: () => void) => done(),
    };
    const exportImage = vi.fn((options: { success: (result: { tempFilePath: string }) => void }) =>
      options.success({ tempFilePath: 'wxfile://poster.png' }),
    );
    vi.stubGlobal('uni', { createCanvasContext: () => ctx, canvasToTempFilePath: exportImage });
    const report = createDemoReport();
    report.projectName = '私密项目甲';
    report.headline = '客户乙支付了987654元';
    expect(await drawPoster(report, true)).toBe('wxfile://poster.png');
    const text = drawn.map((item) => item.text).join('');
    for (const label of ['阻断性红旗', '橙旗', '关键假设', '死亡预言', '红旗阻断', '微信搜索「AI投了么」', '免费查看示例报告，练习自己的项目'])
      expect(text).toContain(label);
    expect(text).toContain('虚构演示');
    expect(text).not.toContain('AI 生成');
    for (const secret of [
      '私密项目甲',
      '客户乙',
      '987654',
      report.diagnostics!.redFlags[0].evidence,
    ])
      expect(text).not.toContain(secret);
    expect(drawn.every((item) => item.y > 0 && item.y < POSTER_HEIGHT)).toBe(true);
    expect(exportImage).toHaveBeenCalledWith(
      expect.objectContaining({
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        destWidth: POSTER_WIDTH * 3,
        destHeight: POSTER_HEIGHT * 3,
      }),
    );
    drawn.length = 0;
    report.mode = 'live';
    await drawPoster(report, true);
    expect(drawn.map((item) => item.text).join('')).toContain('AI 生成');
    expect(drawn.every((item) => item.y > 0 && item.y < POSTER_HEIGHT)).toBe(true);
  });
  it('使用实际扫码图片并扩展海报高度；不把本机报告编号绘制到二维码', async () => {
    const drawImage = vi.fn(),
      drawn: string[] = [];
    const ctx = {
      setFillStyle: vi.fn(),
      fillRect: vi.fn(),
      setFontSize: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (text: string) => drawn.push(text),
      drawImage,
      draw: (_reserve: boolean, done: () => void) => done(),
    };
    const exportImage = vi.fn((options: { success: (value: { tempFilePath: string }) => void }) =>
      options.success({ tempFilePath: 'wxfile://poster-entry.png' }),
    );
    vi.stubGlobal('uni', { createCanvasContext: () => ctx, canvasToTempFilePath: exportImage });
    await drawPoster(createDemoReport(), true, { codePath: 'wxfile://official-code.png' });
    expect(drawImage).toHaveBeenCalledWith(
      'wxfile://official-code.png',
      26,
      655,
      104,
      104,
    );
    expect(drawn.join('')).toContain('扫码看完整评估');
    expect(drawn.join('')).toContain('也给你的项目');
    expect(exportImage).toHaveBeenCalledWith(
      expect.objectContaining({ height: 812, destHeight: 2436 }),
    );
  });
});
