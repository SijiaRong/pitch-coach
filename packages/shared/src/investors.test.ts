import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  FUNDING_ROUNDS,
  INDUSTRIES,
  INVESTORS,
  INVESTOR_ROSTER,
  LEGACY_INVESTORS,
  PREFERENCES,
  getPanel,
  getSpecialist,
  recommendPreferences,
} from './catalog';
import type { PreferenceId } from './catalog';
import { createDemoReport, EXAMPLES } from './demo';
import { panelPreferencesSchema, reviewContentSchema, submissionSchema } from './schema';
import { aggregateReport, prepareReview } from './scoring';

describe('行业 × 轮次 × 偏好教练', () => {
  it('完整覆盖 288 个格子，姓名、ID、专项要求与完整开场白均不重复', () => {
    expect(INVESTOR_ROSTER).toHaveLength(
      INDUSTRIES.length * FUNDING_ROUNDS.length * PREFERENCES.length,
    );
    expect(INVESTOR_ROSTER).toHaveLength(288);
    for (const field of ['id', 'name', 'focus', 'opening'] as const)
      expect(new Set(INVESTOR_ROSTER.map((investor) => investor[field])).size).toBe(
        INVESTOR_ROSTER.length,
      );
    for (const industry of INDUSTRIES)
      for (const round of FUNDING_ROUNDS)
        for (const preference of PREFERENCES) {
          const investor = getSpecialist(industry.id, round.id, preference.id);
          expect(investor).toMatchObject({
            industry: industry.id,
            round: round.id,
            preference: preference.id,
          });
          expect(investor.focus).toContain(industry.name);
          expect(investor.focus).toContain(round.name);
          expect(investor.question.length).toBeGreaterThan(10);
          expect(investor.roundQuestion.length).toBeGreaterThan(10);
          expect(investor.task.length).toBeGreaterThan(10);
          expect(INVESTORS[investor.id]).toBe(investor);
        }
  });

  it('每个格子都可被邀请，所有三偏好组合只选择本行业和本轮的三位', () => {
    for (const industry of INDUSTRIES)
      for (const round of FUNDING_ROUNDS) {
        for (let a = 0; a < PREFERENCES.length - 2; a++)
          for (let b = a + 1; b < PREFERENCES.length - 1; b++)
            for (let c = b + 1; c < PREFERENCES.length; c++) {
              const preferences = [PREFERENCES[a].id, PREFERENCES[b].id, PREFERENCES[c].id];
              const panel = getPanel(industry.id, round.id, preferences);
              expect(panel.map((investor) => investor.preference)).toEqual(preferences);
              expect(
                panel.every(
                  (investor) => investor.industry === industry.id && investor.round === round.id,
                ),
              ).toBe(true);
              expect(new Set(panel.map((investor) => investor.id)).size).toBe(3);
            }
      }
    for (const preference of PREFERENCES) {
      const recommended = recommendPreferences(preference.id);
      expect(recommended).toContain(preference.id);
      expect(new Set(recommended).size).toBe(3);
    }
  });

  it('旧请求默认三偏好；拒绝未知偏好、重复或增减评审数量', () => {
    const oldInput = {
      projectName: '测试',
      industry: 'ai',
      round: 'angel',
      stage: '已有原型',
      description: EXAMPLES.ai.description,
      consent: true,
    };
    expect(submissionSchema.parse(oldInput).preferences).toEqual(DEFAULT_PREFERENCES);
    for (const preferences of [
      [],
      ['team'],
      ['team', 'product'],
      ['team', 'team', 'strategy'],
      ['team', 'product', 'unknown'],
      ['team', 'product', 'strategy', 'growth'],
    ])
      expect(submissionSchema.safeParse({ ...oldInput, preferences }).success).toBe(false);
    expect(() => getPanel('ai', 'angel', ['team'])).toThrow('THREE_DISTINCT');
    expect(panelPreferencesSchema.parse(['team', 'strategy', 'product'])).toEqual([
      'team',
      'strategy',
      'product',
    ]);
  });

  it('专项 Demo 的问题和补证任务随三轴变化，结果始终标注固定演示', () => {
    for (const industry of INDUSTRIES)
      for (const round of FUNDING_ROUNDS)
        for (const preference of PREFERENCES) {
          const preferences = recommendPreferences(preference.id);
          const report = createDemoReport(industry.id, 'sharp', round.id, preferences);
          const first = getSpecialist(industry.id, round.id, preference.id);
          expect(report.mode).toBe('demo');
          expect(report.preferences).toEqual(preferences);
          expect(report.investors.map((review) => review.investorId)).toEqual(
            getPanel(industry.id, round.id, preferences).map((investor) => investor.id),
          );
          expect(report.investors[0].questions).toContain(first.question);
          expect(report.investors[0].questions).toContain(first.roundQuestion);
          expect(
            report.investors[0].dimensions.some((dimension) => dimension.action === first.task),
          ).toBe(true);
          for (const review of report.investors)
            expect(reviewContentSchema.safeParse(review).success).toBe(true);
        }
  });

  it('自选组合缺席按实际名单计算，调整名单顺序不会改变演示得分', () => {
    const preferences: PreferenceId[] = ['team', 'product', 'strategy'];
    const input = submissionSchema.parse({
      projectName: '测试',
      industry: 'hardware',
      round: 'a',
      stage: '已有用户',
      description: EXAMPLES.hardware.description,
      bpText: EXAMPLES.hardware.bp,
      preferences,
      consent: true,
    });
    const demo = createDemoReport('hardware', 'sharp', 'a', preferences);
    const reviews = demo.investors
      .slice(1)
      .map((review) => prepareReview(review, review.investorId, 'test', input));
    const report = aggregateReport(input, reviews, { id: 'test', mode: 'live' });
    expect(report.missingInvestors).toEqual([getPanel('hardware', 'a', preferences)[0].id]);
    expect(report.verdict).not.toBe('invest');
    expect(createDemoReport('hardware', 'sharp', 'a', [...preferences].reverse()).score).toBe(
      demo.score,
    );
  });

  it('以前保存在设备上的角色 ID 仍有展示资料，不混入新的可选名单', () => {
    for (const [id, investor] of Object.entries(LEGACY_INVESTORS)) {
      expect(INVESTORS[id]).toEqual(investor);
      expect(INVESTOR_ROSTER.some((item) => item.id === id)).toBe(false);
    }
  });
});
