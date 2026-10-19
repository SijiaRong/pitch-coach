import { describe, expect, it } from 'vitest';
import { DIMENSIONS, FUNDING_ROUNDS, INDUSTRIES, getPanel, getWeights } from './catalog';
import { EXAMPLES, createDemoReport } from './demo';
import { reviewContentSchema, submissionSchema } from './schema';
import type { ReviewContent, Submission } from './schema';
import { aggregateReport, prepareReview, verifyEvidence, weightedScore } from './scoring';

const submission: Submission = {
  projectName: '测试项目',
  industry: 'ai',
  round: 'angel',
  stage: '已有收入',
  description: EXAMPLES.ai.description,
  bpText: EXAMPLES.ai.bp,
  consent: true,
  tone: 'sharp',
};
const evidence = '已服务 24 家付费客户';
const content = (score = 80): ReviewContent => ({
  vote: 'invest',
  thesis: '愿意进一步核验客户数据',
  oneLiner: '先有证据，再谈远方。',
  dimensions: DIMENSIONS.map((item) => ({
    id: item.id,
    score,
    evidence,
    reason: '根据团队提供的资料判断，仍需尽调。',
    action: '补充可核验的客户记录。',
  })),
  questions: ['客户为什么持续使用？', '多久能够收回获客成本？'],
  risks: ['材料中的收入尚未独立核验。'],
});
const panel = (value = content()) =>
  getPanel('ai').map((investor) => prepareReview(value, investor.id, 'mock-model', submission));

describe('评分与结论', () => {
  it('所有行业的权重合计为 100，且主审随行业切换', () => {
    for (const industry of INDUSTRIES) {
      expect(Object.values(industry.weights).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(getPanel(industry.id)).toHaveLength(3);
      expect(getPanel(industry.id)[0].id).toBe(industry.lead);
    }
  });
  it('剔除模型编造的原文证据，不把缺失证据算成零分', () => {
    const value = content();
    value.dimensions[0].evidence = '有 100 万真实付费客户';
    const verified = verifyEvidence(value, submission.description + submission.bpText);
    expect(verified.dimensions[0].score).toBeNull();
    expect(weightedScore(verified.dimensions, submission)).toEqual({
      score: 80,
      coverage: 100 - getWeights('ai', 'angel').problem,
    });
  });
  it('没有证据时分数为 null，结论为资料不足', () => {
    const value = content();
    value.dimensions.forEach((item) => {
      item.evidence = '';
    });
    const report = aggregateReport(submission, panel(value), { id: 'test', mode: 'live' });
    expect(report.score).toBeNull();
    expect(report.coverage).toBe(0);
    expect(report.verdict).toBe('insufficient');
  });
  it('不足 60% 的评审证据强制转为资料不足，即使模型投赞成票', () => {
    const value = content();
    value.dimensions.slice(3).forEach((item) => {
      item.score = null;
      item.evidence = '';
    });
    const prepared = prepareReview(value, 'ai-partner', 'mock', submission);
    expect(prepared.coverage).toBeLessThan(60);
    expect(prepared.vote).toBe('insufficient');
  });
  it('只完成一位评审也不能给投资结论', () => {
    const report = aggregateReport(submission, panel().slice(0, 1), { id: 'test', mode: 'live' });
    expect(report.verdict).toBe('insufficient');
    expect(report.missingInvestors).toHaveLength(2);
  });
  it('三人完成、两人同意、覆盖足够才允许愿意推进', () => {
    const reviews = panel();
    reviews[2].vote = 'pass';
    expect(aggregateReport(submission, reviews, { id: 'test', mode: 'live' }).verdict).toBe(
      'invest',
    );
    expect(
      aggregateReport(submission, reviews.slice(0, 2), { id: 'test', mode: 'live' }).verdict,
    ).toBe('watch');
  });
  it('投票分歧保守处理，两人反对则暂不投资', () => {
    const reviews = panel();
    reviews[0].vote = 'pass';
    reviews[1].vote = 'watch';
    expect(aggregateReport(submission, reviews, { id: 'test', mode: 'live' }).verdict).toBe(
      'watch',
    );
    reviews[1].vote = 'pass';
    expect(aggregateReport(submission, reviews, { id: 'test', mode: 'live' }).verdict).toBe('pass');
  });
  it('最低分和待补证据优先进入可执行的改进清单', () => {
    const value = content();
    value.dimensions[3].score = 12;
    value.dimensions[1].score = null;
    const report = aggregateReport(submission, panel(value), { id: 'test', mode: 'live' });
    expect(report.actions.map((action) => action.dimension).slice(0, 2)).toEqual([
      '市场空间',
      '竞争壁垒',
    ]);
    expect(report.actions.every((action) => action.task.length > 0)).toBe(true);
  });
  it('重复维度、越界分数与缺失同意均不能进入评估', () => {
    const duplicate = content();
    duplicate.dimensions[1].id = 'problem';
    expect(reviewContentSchema.safeParse(duplicate).success).toBe(false);
    const overflow = content(101);
    expect(reviewContentSchema.safeParse(overflow).success).toBe(false);
    expect(submissionSchema.safeParse({ ...submission, consent: false }).success).toBe(false);
  });
  it('全部行业演示均有明确 demo 标记与对应主审', () => {
    for (const industry of INDUSTRIES) {
      const report = createDemoReport(industry.id);
      expect(report.mode).toBe('demo');
      expect(report.investors[0].investorId).toBe(industry.lead);
      expect(report.projectName).toBe(EXAMPLES[industry.id].name);
      expect(report.dimensions).toHaveLength(8);
    }
  });
  it('行业 × 轮次的 48 种组合权重都合计 100，并匹配对应教练', () => {
    for (const industry of INDUSTRIES)
      for (const round of FUNDING_ROUNDS) {
        expect(
          Object.values(getWeights(industry.id, round.id)).reduce((sum, value) => sum + value, 0),
        ).toBe(100);
        const matched = getPanel(industry.id, round.id);
        expect(matched[0].id).toBe(industry.lead);
        expect(matched[1].id).toBe(round.coach);
        expect(new Set(matched.map((investor) => investor.id)).size).toBe(3);
        expect(createDemoReport(industry.id, 'sharp', round.id).round).toBe(round.id);
      }
  });
  it('种子轮更重视需求与团队，后期轮更重视商业模式和融资逻辑', () => {
    const seed = getWeights('ai', 'seed'),
      late = getWeights('ai', 'growth');
    expect(seed.problem + seed.team).toBeGreaterThan(late.problem + late.team);
    expect(late.business + late.funding).toBeGreaterThan(seed.business + seed.funding);
  });
});
