import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  DIMENSIONS,
  EXAMPLES,
  createDemoReport,
  getPanel,
} from '@pitchcoach/shared';
import { emptyDiagnostics } from '@pitchcoach/shared';
import type { ReviewContent, Submission } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { loadConfig } from '../src/config';
import { createReviewer } from '../src/provider';
import type { Reviewer } from '../src/provider';
import { extractDocument } from '../src/extract';
import { EvaluationJobs } from '../src/jobs';
import JSZip from 'jszip';

const config = loadConfig({
  NODE_ENV: 'test',
  SESSION_SECRET: 'test-secret-only-not-for-production',
});
const input: Submission = {
  projectName: '测试项目',
  industry: 'ai',
  round: 'angel',
  preferences: [...DEFAULT_PREFERENCES],
  stage: '已有收入',
  description: EXAMPLES.ai.description,
  bpText: EXAMPLES.ai.bp,
  consent: true,
  tone: 'sharp',
};
const review: ReviewContent = {
  vote: 'watch',
  thesis: '仍需核验',
  oneLiner: '先看证据。',
  dimensions: DIMENSIONS.map((item) => ({
    id: item.id,
    score: 70,
    evidence: '已服务 24 家付费客户',
    reason: '有早期数据，尚未独立尽调。',
    action: '提供客户留存记录。',
  })),
  questions: ['客户如何获知产品？', '如何验证持续付费？'],
  diagnostics: emptyDiagnostics(),
  risks: ['财务数据尚未核验。'],
};
const reviewer: Reviewer = async () => ({ content: review, model: 'test-double' });
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const makeApp = async (withAI = true) => {
  const app = await createApp(config, withAI ? { reviewer } : {});
  apps.push(app);
  return app;
};
const auth = (owner = 'user-a') => ({ authorization: `Bearer ${issueToken(owner, config)}` });

describe('评估 API', () => {
  it('未登录不能调用付费评估或上传', async () => {
    const app = await makeApp();
    expect(
      (await app.inject({ method: 'POST', url: '/api/evaluations', payload: input })).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/documents/extract' })).statusCode).toBe(
      401,
    );
  });
  it('验证同意与字段，不接受伪造、过期会话', async () => {
    const app = await makeApp();
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      headers: auth(),
      payload: { ...input, consent: false },
    });
    expect(rejected.statusCode).toBe(400);
    const badToken = await app.inject({
      url: '/api/evaluations/00000000-0000-4000-8000-000000000000',
      headers: { authorization: 'Bearer forged.token' },
    });
    expect(badToken.statusCode).toBe(401);
    const past = Date.now() - 3 * 60 * 60 * 1000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(past);
    const expired = issueToken('user-a', config);
    clock.mockRestore();
    expect(
      (
        await app.inject({
          url: '/api/evaluations/00000000-0000-4000-8000-000000000000',
          headers: { authorization: `Bearer ${expired}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('创建异步评估、轮询报告，并阻止其他用户读写', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      headers: auth(),
      payload: input,
    });
    expect(created.statusCode).toBe(202);
    const id = created.json().id;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await app.inject({ url: `/api/evaluations/${id}`, headers: auth() });
    expect(result.json().status).toBe('done');
    expect(result.json().report.mode).toBe('live');
    expect(result.json().report.investors).toHaveLength(3);
    expect(JSON.stringify(result.json()).includes('bpText')).toBe(false);
    expect(
      (await app.inject({ url: `/api/evaluations/${id}`, headers: auth('user-b') })).statusCode,
    ).toBe(404);
    await app.inject({ method: 'DELETE', url: `/api/evaluations/${id}`, headers: auth('user-b') });
    expect((await app.inject({ url: `/api/evaluations/${id}`, headers: auth() })).statusCode).toBe(
      200,
    );
    await app.inject({ method: 'DELETE', url: `/api/evaluations/${id}`, headers: auth() });
    expect((await app.inject({ url: `/api/evaluations/${id}`, headers: auth() })).statusCode).toBe(
      404,
    );
  });
  it('没有密钥时明确失败，不偷偷返回固定演示', async () => {
    const app = await makeApp(false);
    const result = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      headers: auth(),
      payload: input,
    });
    expect(result.statusCode).toBe(503);
    expect(result.json().error.code).toBe('AI_NOT_CONFIGURED');
    expect((await app.inject('/api/config')).json().liveAvailable).toBe(false);
  });
  it('拒绝生产环境弱密钥和缺少微信凭据', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('SESSION_SECRET');
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(32) })).toThrow(
      'WECHAT',
    );
  });
  it('正确处理位于文件后面的 multipart 同意字段', async () => {
    const app = await makeApp();
    const boundary = 'pitchcoach-test-boundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bp.txt"\r\nContent-Type: text/plain\r\n\r\n${EXAMPLES.ai.bp}\r\n--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\ntrue\r\n--${boundary}--\r\n`;
    const result = await app.inject({
      method: 'POST',
      url: '/api/documents/extract',
      headers: { ...auth(), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().text).toBe(EXAMPLES.ai.bp);
  });
});

describe('模型适配与任务退化', () => {
  it('完整任务链保留四类诊断，红旗覆盖高分与其他投资票', async () => {
    const diagnostics = createDemoReport().investors[0].diagnostics;
    const jobs = new EvaluationJobs(config, async (_submission, investor) => ({
      content: {
        ...review,
        vote: 'invest',
        diagnostics: investor.preference === 'technology' ? diagnostics : emptyDiagnostics(),
      },
      model: 'test-only',
    }));
    try {
      const job = jobs.create('diagnostic-owner', input);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = jobs.get(job.id, 'diagnostic-owner');
      expect(result.status).toBe('done');
      expect(result.report?.verdict).toBe('pass');
      expect(result.report?.diagnostics?.redFlags).toHaveLength(1);
      expect(result.report?.diagnostics?.orangeFlags).toHaveLength(1);
      expect(result.report?.diagnostics?.failureModes).toHaveLength(1);
      expect(result.report?.diagnostics?.assumptions).toHaveLength(1);
      expect(result.report?.diagnostics?.redFlags[0].investorIds).toEqual([getPanel('ai')[0].id]);
    } finally {
      jobs.close();
    }
  });
  it('模型漏掉专项诊断时明确报错，不把未检查伪装成没有风险', async () => {
    const { diagnostics, ...legacy } = review;
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(legacy) } }],
        }),
      )) as typeof fetch;
    const run = createReviewer(loadConfig({ NODE_ENV: 'test', AI_API_KEY: 'test-only' }), fetcher);
    await expect(run(input, getPanel('ai')[0], new AbortController().signal)).rejects.toMatchObject(
      { code: 'AI_INVALID_RESPONSE' },
    );
  });
  it('仅传服务端配置的模型参数，正确解析 JSON mode', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(review) } }],
          }),
        ),
    );
    const local = loadConfig({
      NODE_ENV: 'test',
      AI_API_KEY: 'test-only',
      AI_MODEL: 'unit-test-model',
    });
    const run = createReviewer(local, fetcher as typeof fetch);
    const result = await run(
      input,
      {
        id: 'ai-partner',
        name: '测试',
        title: '测试',
        mark: 'T',
        color: 'green',
        style: '测试',
        focus: '测试',
        opening: '测试',
      },
      new AbortController().signal,
    );
    expect(result.content).toEqual(review);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.model).toBe('unit-test-model');
  });
  it('截断或异常输出不能伪装成有效评分', async () => {
    const local = loadConfig({ NODE_ENV: 'test', AI_API_KEY: 'test-only' });
    const investor = {
      id: 'ai-partner',
      name: '测试',
      title: '测试',
      mark: 'T',
      color: 'green',
      style: '',
      focus: '',
      opening: '',
    };
    const run = createReviewer(
      local,
      (async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: JSON.stringify(review) } }],
          }),
        )) as typeof fetch,
    );
    await expect(run(input, investor, new AbortController().signal)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
  it('部分模型失败时标注缺席；全部失败时明确报错', async () => {
    const partial = new EvaluationJobs(config, async (_input, investor) => {
      if (investor.preference === 'technology') throw new Error('upstream');
      return { content: review, model: 'mock' };
    });
    const job = partial.create('one', input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(partial.get(job.id, 'one').report?.missingInvestors).toEqual([getPanel('ai')[0].id]);
    expect(partial.get(job.id, 'one').report?.verdict).toBe('watch');
    partial.close();
    const failed = new EvaluationJobs(config, async () => {
      throw new Error('private vendor payload');
    });
    const broken = failed.create('one', input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed.get(broken.id, 'one').status).toBe('failed');
    expect(failed.get(broken.id, 'one').error?.message).not.toContain('private');
    failed.close();
  });
  it('并发限额和取消会向模型请求传播', async () => {
    const signals: AbortSignal[] = [];
    const jobs = new EvaluationJobs(
      loadConfig({ NODE_ENV: 'test', MAX_ACTIVE_EVALUATIONS: '1' }),
      async (_submission, _investor, signal) => {
        signals.push(signal);
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
        );
      },
    );
    const job = jobs.create('one', input);
    expect(() => jobs.create('two', input)).toThrow('投委会正忙');
    jobs.remove(job.id, 'one');
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(() => jobs.get(job.id, 'one')).toThrow('不存在');
    jobs.close();
  });
});

describe('资料解析边界', () => {
  it('从有效 PDF 中提取实际文本，且不依赖 OCR', async () => {
    const stream =
      'BT /F1 14 Tf 50 750 Td (PitchCoach business plan with customers and revenue evidence.) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const result = await extractDocument(Buffer.from(pdf), 'bp.pdf');
    expect(result.text).toContain('PitchCoach business plan');
  });
  it('从 DOCX 提取中文并安全解码标准 XML 实体', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>项目验证资料：团队经验、客户留存 &amp; 收入成本需要逐项核验。</w:t></w:r></w:p></w:body></w:document>',
    );
    const result = await extractDocument(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'bp.docx',
    );
    expect(result.text).toContain('客户留存 & 收入成本');
  });
  it('解析文字并明确标记超长截断', async () => {
    const result = await extractDocument(
      Buffer.from('这是一份有足够文字的项目资料。'.repeat(5000)),
      'bp.txt',
    );
    expect(result.text.length).toBe(50000);
    expect(result.truncated).toBe(true);
  });
  it('提取 Office 文字并保留幻灯片顺序', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide2.xml',
      '<p:sld xmlns:a="x"><a:t>第二页：客户数据与收入模型，需要进一步验证。</a:t></p:sld>',
    );
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:a="x"><a:t>第一页：这是一份测试项目的商业计划。</a:t></p:sld>',
    );
    const result = await extractDocument(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'bp.pptx',
    );
    expect(result.text.startsWith('第一页')).toBe(true);
    expect(result.text).toContain('第二页');
  });
  it('拒绝不支持格式和伪装的 PDF', async () => {
    await expect(extractDocument(Buffer.from('bad'), 'bp.exe')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    });
    await expect(extractDocument(Buffer.from('not a pdf'), 'bp.pdf')).rejects.toMatchObject({
      code: 'PARSE_FAILED',
    });
  });
});
