import { describe, expect, it } from 'vitest';
import { createDemoReport } from './demo';
import {
  createOrderSchema,
  formatPrice,
  parsePrice,
  PRICE_PRESETS_FEN,
  publicReportCopy,
  publishProjectSchema,
  revenueSplit,
  makeDemoScene,
  readDemoScene,
} from './commerce';
import { INDUSTRY_IDS, ROUND_IDS, DEFAULT_PREFERENCES } from './catalog';
describe('项目参与金额与披露规则', () => {
  it('四档金额精确按分处理，自定义不接受浮点歧义、科学计数或越界', () => {
    expect(PRICE_PRESETS_FEN.map(formatPrice)).toEqual(['8.88', '88.88', '888.88', '8888.88']);
    for (const value of ['0.01', '8.8', '8888.88', '99999.99'])
      expect(formatPrice(parsePrice(value)!)).toBe(value === '8.8' ? '8.80' : value);
    for (const value of ['0', '-1', '1e3', '8.888', 'NaN', 'Infinity', '01.00', '100000', '8,88'])
      expect(parsePrice(value)).toBeUndefined();
  });
  it('公开与私密披露分开确认；留联系方式必须主动授权，打赏限定四档', () => {
    const input = { report: createDemoReport(), publicReportConsent: true, unlockEnabled: true };
    expect(publishProjectSchema.safeParse(input).success).toBe(false);
    const base = {
      kind: 'tip',
      amountFen: 888,
      expectedRevision: 1,
      role: 'supporter',
      purchaseConsent: true,
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    };
    expect(createOrderSchema.safeParse(base).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, amountFen: 100 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, contact: '微信 user123' }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ ...base, contact: '微信 user123', shareContactConsent: true })
        .success,
    ).toBe(true);
    expect(
      createOrderSchema.safeParse({ ...base, kind: 'unlock', role: 'entrepreneur' }).success,
    ).toBe(false);
  });
  it('公开副本移除服务端凭证和本机报告编号，匿名范围如实限定于标题', () => {
    const report = createDemoReport();
    report.publicationProof = 'private-proof';
    const copy = publicReportCopy(report, true);
    expect(copy.publicationProof).toBeUndefined();
    expect(copy.id).toBe('');
    expect(copy.projectName).toBe('某创业项目');
    expect(copy.investors).toHaveLength(3);
    expect(copy.dimensions).toHaveLength(8);
    expect(report.publicationProof).toBe('private-proof');
  });
  it('5% 服务费按净实收逐笔四舍五入到分，项目方份额与服务费精确守恒', () => {
    expect(PRICE_PRESETS_FEN.map((fen) => revenueSplit(fen, 0)?.platformFeeFen)).toEqual([
      44, 444, 4444, 44444,
    ]);
    expect(revenueSplit(8888, 8888)).toEqual({
      netReceiptsFen: 0,
      platformFeeFen: 0,
      projectShareFen: 0,
    });
    expect(revenueSplit(10, 0)).toEqual({
      netReceiptsFen: 10,
      platformFeeFen: 1,
      projectShareFen: 9,
    });
    for (let fen = 0; fen < 2000; fen++) {
      const split = revenueSplit(fen, 0)!;
      expect(split.platformFeeFen + split.projectShareFen).toBe(fen);
    }
    expect(revenueSplit(100, 101)).toBeUndefined();
    expect(revenueSplit(1.1, 0)).toBeUndefined();
  });
  it('示例扫码场景不含私密信息，覆盖行业轮次组合且符合微信 32 字符上限', () => {
    for (const industry of INDUSTRY_IDS)
      for (const round of ROUND_IDS) {
        const value = {
          industry,
          round,
          priceFen: 9999999,
          anonymous: true,
          preferences: [...DEFAULT_PREFERENCES],
        };
        const scene = makeDemoScene(value);
        expect(scene.length).toBeLessThanOrEqual(32);
        expect(readDemoScene(scene)).toEqual(value);
      }
    for (const value of [
      'd~ai~angel~0~1~012',
      'd~ai~angel~8888~1~999',
      'd~ai~angel~8888~1~000',
      'd~ai~angel~8888~1~012~extra',
    ])
      expect(readDemoScene(value)).toBeUndefined();
  });
});
