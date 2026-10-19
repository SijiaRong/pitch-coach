import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, DIMENSIONS, getPanel } from './catalog';
import { createDemoReport } from './demo';
import { emptyDiagnostics } from './diagnostic-schema';
import type { FailureMode, KeyAssumption, OrangeFlag, RedFlag } from './diagnostic-schema';
import { decisionLabel, publicDiagnosticSummary, verifyDiagnostics } from './diagnostics';
import { reviewContentSchema } from './schema';
import type { ReviewContent, Submission } from './schema';
import { aggregateReport, prepareReview } from './scoring';

const blocker = '授权方已明确拒绝商业使用，当前交付依赖该素材且无替代方案';
const source: Submission = {
  projectName: '私密项目甲',
  industry: 'ai',
  round: 'angel',
  preferences: [...DEFAULT_PREFERENCES],
  stage: '已有收入',
  description: `用户反馈节省操作时间，已有付费客户。${blocker}。`,
  bpText: '客户机密乙向我们支付 987654 元。',
  consent: true,
  tone: 'sharp',
};
const red: RedFlag = {
  topic: 'data',
  basis: 'explicit_statement',
  evidence: blocker,
  title: '关键交付前提被阻断',
  detail: '依赖缺乏授权且无替代方案的素材，需先解决交付前提。',
  question: '如何取得可用授权或完成替代交付？',
  remedy: '提供商业授权范围或替代交付的验收记录。',
};
const orange: OrangeFlag = {
  topic: 'cash',
  evidence: '',
  title: '现金跑道未说明',
  detail: '缺少现金余额和分月预算。',
  missing: '当前现金余额和预算',
  question: '现金能够支持到哪个可核验里程碑？',
  remedy: '补充分月现金预算。',
};
const assumption: KeyAssumption = {
  topic: 'growth',
  statement: '早期付费能转化为持续续约。',
  basis: 'inferred',
  evidence: '',
  whyCritical: '续约失效会使增长基础失效。',
  test: '跟踪新客户的续约与付款记录。',
  passCriterion: '建议事先约定续约观察周期与最低可接受比例。',
};
const failure: FailureMode = {
  mechanism: 'access_block',
  basedOn: ['data'],
  condition: '若授权问题不能解决',
  chain: '交付受阻 → 退款增加 → 商业化可能停摆。',
  earlySignal: '交付延期与退款。',
  prevention: '先验证替代交付。',
};
const content = (): ReviewContent => ({
  vote: 'invest',
  thesis: '模型愿意推进',
  oneLiner: '先把证据摆上桌。',
  dimensions: DIMENSIONS.map((item) => ({
    id: item.id,
    score: 95,
    evidence: '已有付费客户',
    reason: '团队陈述，尚未独立尽调。',
    action: '核验客户付款。',
  })),
  questions: ['客户是否持续付费？', '如何满足交付条件？'],
  risks: ['尚需独立核验。'],
  diagnostics: emptyDiagnostics(),
});
const panel = (value: ReviewContent) =>
  getPanel('ai').map((investor) => prepareReview(value, investor.id, 'test-only', source));
const report = (value: ReviewContent) =>
  aggregateReport(source, panel(value), { id: 'test', mode: 'live' });

describe('四类风险诊断与投资门槛', () => {
  it('高分与两票赞成不能抵消一位评审指出的有效红旗', () => {
    const reviews = panel(content());
    const blocked = content();
    blocked.diagnostics.redFlags = [red];
    reviews[0] = prepareReview(blocked, reviews[0].investorId, 'test', source);
    expect(reviews[0].vote).toBe('pass');
    const result = aggregateReport(source, reviews, { id: 'blocked', mode: 'live' });
    expect(result.score).toBe(95);
    expect(result.verdict).toBe('pass');
    expect(result.diagnostics?.gate).toBe('blocked');
    expect(decisionLabel(result)).toBe('红旗阻断');
    expect(result.decisionReasons?.[0]).toContain('不能抵消');
    expect(result.actions[0].task).toBe(red.remedy);
    expect(result.summary).toContain('红旗 1 项');
    expect(
      aggregateReport(source, reviews.slice(0, 1), { id: 'partial', mode: 'live' }).verdict,
    ).toBe('pass');
  });
  it('模型捏造的红旗引用降为待核验问题，不能保留无依据指控', () => {
    const value = emptyDiagnostics();
    value.redFlags = [
      {
        ...red,
        evidence: '已被查实伪造合同，拒绝所有审计',
        title: '编造的造假指控',
        detail: '编造的事实',
      },
    ];
    value.failureModes = [failure];
    const verified = verifyDiagnostics(value, source.description);
    expect(verified.redFlags).toHaveLength(0);
    expect(verified.orangeFlags[0].title).toContain('待核验');
    expect(JSON.stringify(verified)).not.toContain('伪造合同');
    expect(JSON.stringify(verified)).not.toContain('编造的事实');
    expect(verified.failureModes).toHaveLength(0);
  });
  it('资料没回答的橙旗或关键假设，会阻止模型直接给出愿意推进', () => {
    for (const key of ['orangeFlags', 'assumptions'] as const) {
      const value = content();
      if (key === 'orangeFlags') value.diagnostics.orangeFlags = [orange];
      else value.diagnostics.assumptions = [assumption];
      const result = report(value);
      expect(result.score).toBe(95);
      expect(result.verdict).toBe('watch');
      expect(result.diagnostics?.redFlags).toHaveLength(0);
      expect(result.decisionReasons?.join('')).toContain(
        key === 'orangeFlags' ? '补证再议' : '关键假设',
      );
    }
  });
  it('橙旗和假设的无效引用不会被展示成资料原文', () => {
    const value = emptyDiagnostics();
    value.orangeFlags = [{ ...orange, evidence: '材料中没有这段话' }];
    value.assumptions = [{ ...assumption, basis: 'stated', evidence: '材料中没有这个承诺' }];
    const verified = verifyDiagnostics(value, source.description);
    expect(verified.orangeFlags[0].evidence).toBe('');
    expect(verified.assumptions[0]).toMatchObject({ basis: 'inferred', evidence: '' });
  });
  it('失败情景必须有条件并关联本次诊断，不关联的推演会移除', () => {
    const value = content();
    value.diagnostics.redFlags = [red];
    value.diagnostics.failureModes = [
      failure,
      { ...failure, mechanism: 'cash_exhaustion', basedOn: ['cash'] },
    ];
    const result = report(value);
    expect(result.diagnostics?.failureModes).toHaveLength(1);
    expect(result.diagnostics?.failureModes[0].basedOn).toEqual(['data']);
    value.diagnostics.failureModes = [{ ...failure, condition: '项目下个月必死' }];
    expect(reviewContentSchema.safeParse(value).success).toBe(false);
  });
  it('相同判断合并并保留全部提出评审，必填诊断不能被旧模型响应悄悄省略', () => {
    const value = content();
    value.diagnostics = {
      redFlags: [red],
      orangeFlags: [orange],
      assumptions: [assumption],
      failureModes: [failure],
    };
    const result = report(value);
    for (const key of ['redFlags', 'orangeFlags', 'assumptions', 'failureModes'] as const) {
      expect(result.diagnostics?.[key]).toHaveLength(1);
      expect(result.diagnostics?.[key][0].investorIds).toHaveLength(3);
    }
    const { diagnostics, ...oldResponse } = value;
    expect(reviewContentSchema.safeParse(oldResponse).success).toBe(false);
  });
  it('公开海报只提取类别与受控条件文案，不携带 BP、模型指控或私密金额', () => {
    const value = content();
    value.diagnostics = {
      redFlags: [{ ...red, title: '客户机密乙', detail: '987654 元' }],
      orangeFlags: [orange],
      assumptions: [assumption],
      failureModes: [{ ...failure, chain: '私密项目甲的机密链条' }],
    };
    const summary = publicDiagnosticSummary(report(value));
    expect(summary.counts).toBe('红旗 1 · 橙旗 1 · 死因 1 · 假设 1');
    expect(summary.red).toBe('数据与授权');
    expect(summary.death).toMatch(/^若/);
    for (const secret of ['私密项目甲', '客户机密乙', '987654', blocker, '机密链条'])
      expect(JSON.stringify(summary)).not.toContain(secret);
  });
  it('旧报告标明未检查，虚构 AI 演示完整展示四类且其他行业不强塞红旗', () => {
    const demo = createDemoReport();
    expect(demo.diagnostics?.redFlags.length).toBeGreaterThan(0);
    expect(demo.diagnostics?.orangeFlags.length).toBeGreaterThan(0);
    expect(demo.diagnostics?.failureModes.length).toBeGreaterThan(0);
    expect(demo.diagnostics?.assumptions.length).toBeGreaterThan(0);
    expect(publicDiagnosticSummary({ verdict: 'watch' }).counts).toContain('未检查');
    for (const industry of ['hardware', 'health'] as const)
      expect(createDemoReport(industry, 'sharp', 'seed').diagnostics?.redFlags).toHaveLength(0);
  });
});
