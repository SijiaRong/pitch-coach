import { describe, expect, it, vi } from 'vitest';
import {
  DIMENSIONS,
  EXAMPLES,
  getPanel,
  getSpecialist,
  submissionSchema,
} from '@pitchcoach/shared';
import type { ReviewContent } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { loadConfig } from '../src/config';
import { EvaluationJobs } from '../src/jobs';
import { buildMessages } from '../src/prompts';
import { createReviewer } from '../src/provider';

const input = submissionSchema.parse({
  projectName: '测试项目',
  industry: 'ai',
  round: 'angel',
  stage: '已有收入',
  description: EXAMPLES.ai.description,
  bpText: EXAMPLES.ai.bp,
  consent: true,
  preferences: ['product', 'team', 'strategy'],
});
const review: ReviewContent = {
  vote: 'watch',
  thesis: '仍需核验资料。',
  oneLiner: '先看证据，再谈远方。',
  dimensions: DIMENSIONS.map((item) => ({
    id: item.id,
    score: 70,
    evidence: '已服务 24 家付费客户',
    reason: '团队陈述有待核验。',
    action: '补充可核验记录。',
  })),
  questions: ['客户为什么持续使用？', '现金如何支持下一项验证？'],
  risks: ['资料尚未独立尽调。'],
};

describe('细分教练的真实评估路径', () => {
  it('API 将自选名单用于模型调用和最终报告，始终只有三次调用', async () => {
    const config = loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-session-only' });
    const reviewer = vi.fn(async () => ({ content: review, model: 'test-model' }));
    const app = await createApp(config, { reviewer });
    try {
      const headers = { authorization: `Bearer ${issueToken('owner', config)}` };
      const created = await app.inject({
        method: 'POST',
        url: '/api/evaluations',
        headers,
        payload: input,
      });
      expect(created.statusCode).toBe(202);
      expect(created.json().totalInvestors).toBe(3);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = (
        await app.inject({ url: `/api/evaluations/${created.json().id}`, headers })
      ).json();
      expect(reviewer).toHaveBeenCalledTimes(3);
      const selected = getPanel(input.industry, input.round, input.preferences).map(
        (investor) => investor.id,
      );
      expect(
        reviewer.mock.calls.map((call) => (call as unknown as [unknown, { id: string }])[1].id),
      ).toEqual(selected);
      expect(result.report.preferences).toEqual(input.preferences);
      expect(
        result.report.investors.map((investor: { investorId: string }) => investor.investorId),
      ).toEqual(selected);
      expect(result.report.missingInvestors).toEqual([]);
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/evaluations',
        headers,
        payload: { ...input, preferences: ['strategy', 'strategy', 'team'] },
      });
      expect(invalid.statusCode).toBe(400);
      expect(reviewer).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });

  it('自选角色失败时保留实际缺席名单，不用默认组合替补', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const jobs = new EvaluationJobs(config, async (_input, investor) => {
      if (investor.preference === 'team') throw new Error('test failure');
      return { content: review, model: 'test-model' };
    });
    try {
      const job = jobs.create('owner', input);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(jobs.get(job.id, 'owner').report?.missingInvestors).toEqual([
        getSpecialist('ai', 'angel', 'team').id,
      ]);
      expect(jobs.get(job.id, 'owner').report?.verdict).toBe('watch');
    } finally {
      jobs.close();
    }
  });

  it('模型请求实际携带行业、轮次与偏好证据要求；改变任一轴都会改变审阅提示', async () => {
    const base = getSpecialist('ai', 'angel', 'product');
    const messages = buildMessages(input, base);
    for (const phrase of ['人工智能', '天使轮', '产品客户', base.question, base.roundQuestion])
      expect(messages[0].content).toContain(phrase);
    const hardware = { ...input, industry: 'hardware' as const };
    const seed = { ...input, round: 'seed' as const };
    const alternatives = [
      buildMessages(hardware, getSpecialist('hardware', 'angel', 'product')),
      buildMessages(seed, getSpecialist('ai', 'seed', 'product')),
      buildMessages(input, getSpecialist('ai', 'angel', 'strategy')),
    ];
    for (const alternative of alternatives)
      expect(alternative[0].content).not.toBe(messages[0].content);
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(review) } }],
          }),
        ),
    );
    await createReviewer(
      loadConfig({
        NODE_ENV: 'test',
        AI_API_KEY: 'test-only',
        AI_PREFERENCE_PRODUCT_MODEL: 'test-product-model',
      }),
      fetcher,
    )(input, base, new AbortController().signal);
    const request = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(request.model).toBe('test-product-model');
    expect(request.messages[0].content).toContain(base.question);
    expect(request.messages[0].content).toContain(base.roundQuestion);
  });
});

describe('细分角色模型配置', () => {
  it('按精确角色、偏好、轮次、行业、旧角色、默认的顺序解析每个字段', () => {
    const env = {
      NODE_ENV: 'test',
      AI_MODEL: 'default',
      AI_API_KEY: 'test-only',
      AI_AI_PARTNER_MODEL: 'legacy',
      AI_INDUSTRY_AI_MODEL: 'industry',
      AI_ROUND_ANGEL_MODEL: 'round',
      AI_PREFERENCE_TECHNOLOGY_MODEL: 'preference',
      AI_AI_ANGEL_TECHNOLOGY_MODEL: 'exact',
      AI_PREFERENCE_TECHNOLOGY_BASE_URL: 'https://preference.example/v1',
    };
    const id = getSpecialist('ai', 'angel', 'technology').id;
    const layers = [
      'AI_AI_ANGEL_TECHNOLOGY_MODEL',
      'AI_PREFERENCE_TECHNOLOGY_MODEL',
      'AI_ROUND_ANGEL_MODEL',
      'AI_INDUSTRY_AI_MODEL',
      'AI_AI_PARTNER_MODEL',
    ] as const;
    for (const expected of ['exact', 'preference', 'round', 'industry', 'legacy']) {
      const layer =
        layers[['exact', 'preference', 'round', 'industry', 'legacy'].indexOf(expected)];
      expect(loadConfig(env).modelFor(id).model).toBe(expected);
      delete (env as Record<string, string | undefined>)[layer];
    }
    expect(loadConfig(env).modelFor(id)).toMatchObject({
      model: 'default',
      apiKey: 'test-only',
      baseUrl: 'https://preference.example/v1',
    });
  });

  it('仅配置偏好密钥也能识别可用性，未配齐的组合在付费调用前拒绝', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AI_PREFERENCE_PRODUCT_API_KEY: 'test-only',
      AI_PREFERENCE_TEAM_API_KEY: 'test-only',
      AI_PREFERENCE_STRATEGY_API_KEY: 'test-only',
    });
    expect(config.liveAvailable).toBe(true);
    expect(
      loadConfig({ NODE_ENV: 'test', AI_PREFERENCE_PRODUCT_API_KEY: 'test-only' }).liveAvailable,
    ).toBe(false);
    const app = await createApp(config);
    try {
      expect((await app.inject('/api/config')).json().liveAvailable).toBe(true);
      const result = await app.inject({
        method: 'POST',
        url: '/api/evaluations',
        headers: { authorization: `Bearer ${issueToken('owner', config)}` },
        payload: { ...input, preferences: ['technology', 'growth', 'financial'] },
      });
      expect(result.statusCode).toBe(503);
      expect(result.json().error.code).toBe('AI_NOT_CONFIGURED');
    } finally {
      await app.close();
    }
  });
});
