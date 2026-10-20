import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createDemoReport, DEFAULT_PREFERENCES, EXAMPLES } from '@pitchcoach/shared';
import type { EvaluationReport, Submission } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { loadConfig } from '../src/config';
import { attestReport } from '../src/report-proof';
import { EvaluationJobs } from '../src/jobs';

const apps: Awaited<ReturnType<typeof createApp>>[] = [],
  dirs: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of dirs.splice(0)) {
    if (
      !resolve(dir).startsWith(resolve(tmpdir()) + sep) ||
      !basename(dir).startsWith('pitchcoach-cloud-test-')
    )
      throw Error('Unexpected cleanup path');
    await rm(dir, { recursive: true, force: true });
  }
});
const input: Submission = {
  projectName: '需要云端保存的私密测试项目',
  industry: 'ai',
  round: 'angel',
  preferences: [...DEFAULT_PREFERENCES],
  stage: '已有收入',
  description: EXAMPLES.ai.description,
  bpText: EXAMPLES.ai.bp,
  tone: 'sharp',
  consent: true,
};
const reviewer = async () => ({
  content: createDemoReport().investors[0],
  model: 'cloud-test-double',
});
async function fixture(extra: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'cloud-test-only-stable-session-secret',
    OWNER_ID_SECRET: 'cloud-test-only-stable-identity-secret',
    CLOUD_STORAGE_ENABLED: 'true',
    PROJECT_DATABASE_PATH: ':memory:',
    PROJECT_DATA_KEY: 'cd'.repeat(32),
    WECHAT_APP_ID: 'wx_cloud_test',
    WECHAT_APP_SECRET: 'cloud-test-app-secret',
    ...extra,
  });
  const app = await createApp(config, {
    reviewer,
    wechatFetch: vi.fn<typeof fetch>(async (url) => {
      expect(new URL(String(url)).pathname).toBe('/sns/jscode2session');
      return Response.json({ openid: 'same-wechat-user', session_key: 'test-session-key' });
    }),
  });
  apps.push(app);
  const owner = 'wx:cloud-owner-a',
    other = 'wx:cloud-owner-b';
  const auth = (id = owner) => ({ authorization: `Bearer ${issueToken(id, config)}` });
  const report: EvaluationReport = {
    ...createDemoReport(),
    id: randomUUID(),
    mode: 'live',
    projectName: input.projectName,
  };
  report.publicationProof = attestReport(report, owner, config.SESSION_SECRET);
  const enable = async (headers = auth()) =>
    app.inject({
      method: 'POST',
      url: '/api/me',
      headers,
      payload: {
        cloudSyncEnabled: true,
        cloudStorageConsent: true,
        displayName: '私密称呼甲',
        role: 'entrepreneur',
      },
    });
  return { app, config, owner, other, auth, report, enable };
}
describe('微信身份与云端报告', () => {
  it('云端可独立启用，匿名会话不能冒充微信绑定，公开分享保持关闭', async () => {
    const f = await fixture();
    expect((await f.app.inject('/api/account/config')).json()).toMatchObject({
      cloudAvailable: true,
      wechatLoginAvailable: true,
    });
    expect((await f.app.inject('/api/me')).statusCode).toBe(401);
    expect(
      (await f.app.inject({ url: '/api/me', headers: f.auth('dev:anonymous') })).statusCode,
    ).toBe(401);
    expect((await f.app.inject(`/api/projects/${'a'.repeat(22)}`)).statusCode).toBe(503);
    const disabled = await fixture({ CLOUD_STORAGE_ENABLED: 'false' });
    expect((await disabled.app.inject('/api/account/config')).json().cloudAvailable).toBe(false);
  });
  it('同一微信用户重复登录绑定相同账户，不向前端返回 openid 或 session_key', async () => {
    const f = await fixture();
    const ids = [];
    for (const code of ['first-login', 'another-device']) {
      const session = await f.app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { code },
      });
      for (const value of ['same-wechat-user', 'test-session-key', 'session_key', 'openid'])
        expect(session.body).not.toContain(value);
      const account = await f.app.inject({
        url: '/api/me',
        headers: { authorization: `Bearer ${session.json().token}` },
      });
      ids.push(account.json().id);
    }
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toHaveLength(16);
  });
  it('默认不保存，开启需要明确同意；昵称与角色只修改本人资料', async () => {
    const f = await fixture();
    expect(
      (await f.app.inject({ url: '/api/me', headers: f.auth() })).json().cloudSyncEnabled,
    ).toBe(false);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/me',
          headers: f.auth(),
          payload: { cloudSyncEnabled: true },
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.enable()).json()).toMatchObject({
      cloudSyncEnabled: true,
      displayName: '私密称呼甲',
      role: 'entrepreneur',
    });
    expect((await f.app.inject({ url: '/api/me', headers: f.auth(f.other) })).json()).toMatchObject(
      { displayName: '', cloudSyncEnabled: false },
    );
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/me',
          headers: f.auth(),
          payload: { owner: f.other, displayName: '冒充' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('新评估自动加密保存，领取并删除临时任务后仍可访问云端报告', async () => {
    const f = await fixture();
    await f.enable();
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/evaluations',
      headers: f.auth(),
      payload: input,
    });
    expect(created.statusCode).toBe(202);
    const id = created.json().id;
    await vi.waitFor(async () => {
      const job = (await f.app.inject({ url: `/api/evaluations/${id}`, headers: f.auth() })).json();
      expect(job.status).toBe('done');
      expect(job.cloudStatus).toBe('saved');
    });
    await f.app.inject({ method: 'DELETE', url: `/api/evaluations/${id}`, headers: f.auth() });
    expect(
      (await f.app.inject({ url: `/api/me/reports/${id}`, headers: f.auth() })).json().projectName,
    ).toBe(input.projectName);
    expect(
      (await f.app.inject({ url: `/api/me/reports/${id}`, headers: f.auth(f.other) })).statusCode,
    ).toBe(404);
    expect(
      (await f.app.inject({ url: '/api/me/reports', headers: f.auth(f.other) })).json(),
    ).toEqual([]);
  });
  it('手动同步校验本人报告，重复上传不重复记数，关闭同步不删除已有报告', async () => {
    const f = await fixture();
    await f.enable();
    const upload = {
      method: 'POST' as const,
      url: '/api/me/reports',
      headers: f.auth(),
      payload: { report: f.report },
    };
    expect((await f.app.inject(upload)).statusCode).toBe(200);
    expect((await f.app.inject(upload)).statusCode).toBe(200);
    const summaries = (await f.app.inject({ url: '/api/me/reports', headers: f.auth() })).json();
    expect(f.report.diagnostics?.redFlags.length).toBeGreaterThan(0);
    expect(summaries[0].decisionText).toBe('红旗阻断');
    expect((await f.app.inject({ url: '/api/me', headers: f.auth() })).json().reportCount).toBe(1);
    expect((await f.app.inject({ ...upload, headers: f.auth(f.other) })).statusCode).toBe(403);
    expect(
      (await f.app.inject({ ...upload, payload: { report: { ...f.report, score: 100 } } }))
        .statusCode,
    ).toBe(403);
    await f.app.inject({
      method: 'POST',
      url: '/api/me',
      headers: f.auth(),
      payload: { cloudSyncEnabled: false },
    });
    expect((await f.app.inject(upload)).statusCode).toBe(409);
    expect(
      (await f.app.inject({ url: `/api/me/reports/${f.report.id}`, headers: f.auth() })).statusCode,
    ).toBe(200);
    await f.app.inject({
      method: 'DELETE',
      url: `/api/me/reports/${f.report.id}`,
      headers: f.auth(f.other),
    });
    expect(
      (await f.app.inject({ url: `/api/me/reports/${f.report.id}`, headers: f.auth() })).statusCode,
    ).toBe(200);
    await f.app.inject({
      method: 'DELETE',
      url: `/api/me/reports/${f.report.id}`,
      headers: f.auth(),
    });
    expect((await f.app.inject({ url: '/api/me/reports', headers: f.auth() })).json()).toEqual([]);
  });
  it('报告和昵称加密落盘，服务重启后保留微信身份与报告', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pitchcoach-cloud-test-'));
    dirs.push(dir);
    const path = join(dir, 'accounts.sqlite'),
      f = await fixture({ PROJECT_DATABASE_PATH: path });
    await f.enable();
    await f.app.inject({
      method: 'POST',
      url: '/api/me/reports',
      headers: f.auth(),
      payload: { report: f.report },
    });
    const before = (await f.app.inject({ url: '/api/me', headers: f.auth() })).json();
    await f.app.close();
    apps.splice(apps.indexOf(f.app), 1);
    const bytes = await readFile(path);
    expect(bytes.includes(Buffer.from(input.projectName))).toBe(false);
    expect(bytes.includes(Buffer.from('私密称呼甲'))).toBe(false);
    const restored = await createApp(f.config);
    apps.push(restored);
    expect((await restored.inject({ url: '/api/me', headers: f.auth() })).json().id).toBe(
      before.id,
    );
    expect(
      (await restored.inject({ url: `/api/me/reports/${f.report.id}`, headers: f.auth() })).json()
        .projectName,
    ).toBe(input.projectName);
  });
  it('云端保存失败不把已完成的真实评估改为失败或隐藏报告', async () => {
    const f = await fixture(),
      jobs = new EvaluationJobs(f.config, reviewer, undefined, () => {
        throw Error('test storage failure');
      });
    const id = jobs.create(f.owner, input).id;
    await vi.waitFor(() => {
      const job = jobs.get(id, f.owner);
      expect(job.status).toBe('done');
      expect(job.cloudStatus).toBe('failed');
      expect(job.report?.projectName).toBe(input.projectName);
    });
    jobs.close();
  });
});
