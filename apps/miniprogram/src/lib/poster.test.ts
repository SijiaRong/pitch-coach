import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoReport, decisionLabel, INVESTORS } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import {
  drawPoster,
  posterModel,
  POSTER_ENTRY_HEIGHT,
  POSTER_HEIGHT,
  POSTER_WIDTH,
} from './poster';

afterEach(() => vi.unstubAllGlobals());

function liveReport(): EvaluationReport {
  const report = createDemoReport('saas', 'sharp', 'pre-a');
  report.mode = 'live';
  return report;
}

function stubCanvas() {
  const drawn: { text: string; y: number }[] = [];
  const drawImage = vi.fn();
  let font = 10;
  const noop = vi.fn();
  const ctx = {
    setFillStyle: noop,
    setStrokeStyle: noop,
    setLineWidth: noop,
    setLineCap: noop,
    setGlobalAlpha: noop,
    setTextAlign: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    drawImage,
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
  return { drawn, drawImage, exportImage, text: () => drawn.map((item) => item.text).join('\n') };
}

describe('海报内容与报告完全一致（不美化评分）', () => {
  it('分数、结论、覆盖率与八维分数逐项照抄报告', () => {
    const report = liveReport();
    const model = posterModel(report, false);
    expect(model.score).toBe(report.score);
    expect(model.verdict).toBe(decisionLabel(report));
    expect(model.coverage).toBe(report.coverage);
    expect(model.reviewers).toBe(report.investors.length);
    expect(model.dimensions).toEqual(
      report.dimensions.map((dimension) => ({ name: dimension.name, score: dimension.score })),
    );
  });
  it('最强项与待补强就是真实最高分与最低分维度；资料不足的维度不参与', () => {
    const report = liveReport();
    report.dimensions.forEach((dimension, index) => {
      dimension.score = [30, null, 88, 41, 55, 12, 67, 70][index];
    });
    const model = posterModel(report, true);
    expect(model.strongest).toEqual({ name: report.dimensions[2].name, score: 88 });
    expect(model.weakest).toEqual({ name: report.dimensions[5].name, score: 12 });
  });
  it('有红旗时海报照样显示“红旗阻断”，不会被总分掩盖', async () => {
    const report = liveReport();
    expect(report.diagnostics).toBeDefined();
    report.diagnostics!.redFlags = [
      {
        id: 'r1',
        topic: report.diagnostics!.orangeFlags[0]?.topic ?? 'legal',
        claim: '示意',
        evidence: '示意',
        question: '示意',
        clearance: '示意',
        reviewers: [],
      } as never,
    ];
    const canvas = stubCanvas();
    await drawPoster(report, true);
    expect(posterModel(report, true).verdict).toBe('红旗阻断');
    expect(canvas.text()).toContain('红旗阻断');
  });
  it('教练语录取自固定资料库，选评分最严的那位', () => {
    const report = liveReport();
    const toughest = [...report.investors].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0];
    const model = posterModel(report, true);
    expect(model.coach?.opening).toBe(INVESTORS[toughest.investorId].opening);
  });
});

describe('海报绘制与隐私', () => {
  it('匿名时不画项目名；任何情况下都不画模型原文、证据、客户或金额', async () => {
    const report = liveReport();
    report.projectName = '私密项目甲';
    report.headline = '客户乙支付了987654元';
    report.summary = '客户乙支付了987654元';
    report.investors[0].questions = ['客户乙的987654元合同能续吗？'];
    const canvas = stubCanvas();
    expect(await drawPoster(report, true)).toBe('wxfile://poster.png');
    const text = canvas.text();
    expect(text).toContain('一个企业服务项目');
    expect(text).toContain(String(report.score));
    expect(text).toContain('AI 生成');
    for (const secret of ['私密项目甲', '客户乙', '987654', report.diagnostics!.orangeFlags[0]?.evidence])
      if (secret) expect(text).not.toContain(secret);
    expect(canvas.drawn.every((item) => item.y > 0 && item.y < POSTER_HEIGHT)).toBe(true);
    expect(canvas.exportImage).toHaveBeenCalledWith(
      expect.objectContaining({
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        destWidth: POSTER_WIDTH * 3,
        destHeight: POSTER_HEIGHT * 3,
      }),
    );
  });
  it('选择显示名称时才画出项目名', async () => {
    const report = liveReport();
    report.projectName = '店长助手';
    const canvas = stubCanvas();
    await drawPoster(report, false);
    expect(canvas.text()).toContain('店长助手');
  });
  it('有扫码入口时画出真实二维码并加高海报，所有文字都在画布内', async () => {
    const canvas = stubCanvas();
    await drawPoster(liveReport(), true, {
      codePath: 'wxfile://official-code.png',
      label: '扫码，给你的项目也做一次评审',
    });
    expect(canvas.drawImage).toHaveBeenCalledWith(
      'wxfile://official-code.png',
      expect.any(Number),
      expect.any(Number),
      80,
      80,
    );
    expect(canvas.text()).toContain('敢接受追问吗');
    expect(canvas.text()).toContain('扫码，给你的项目也做一次评审');
    expect(canvas.drawn.every((item) => item.y > 0 && item.y < POSTER_ENTRY_HEIGHT)).toBe(true);
    expect(canvas.exportImage).toHaveBeenCalledWith(
      expect.objectContaining({ height: POSTER_ENTRY_HEIGHT, destHeight: POSTER_ENTRY_HEIGHT * 3 }),
    );
  });
});
