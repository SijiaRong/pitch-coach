import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDemoReport } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { createSession, issueToken } from '../src/auth';
import { loadConfig } from '../src/config';
import { ProjectStore } from '../src/project-store';
import { attestReport } from '../src/report-proof';
import { ViewCounter } from '../src/view-counter';
import { IdentityVault } from '../src/wechat-api';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
const stores: ProjectStore[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const store of stores.splice(0)) store.close();
});

const identity = (n: number) => ({ openid: `openid-${n}`, sessionKey: `key-${n}` });

describe('登录身份缓存不会阻断登录', () => {
  it('满额时淘汰最早的登录，而不是拒绝新登录', () => {
    const vault = new IdentityVault(3);
    for (let n = 1; n <= 5; n++) vault.put(`owner-${n}`, identity(n));
    expect(vault.size).toBe(3);
    expect(() => vault.get('owner-1')).toThrow('请重新登录微信后再付款');
    expect(() => vault.get('owner-2')).toThrow('请重新登录微信后再付款');
    expect(vault.get('owner-5')).toEqual(identity(5));
  });
  it('重复登录刷新顺序，最近活跃的用户不会先被淘汰', () => {
    const vault = new IdentityVault(2);
    vault.put('a', identity(1));
    vault.put('b', identity(2));
    vault.put('a', identity(3));
    vault.put('c', identity(4));
    expect(vault.get('a')).toEqual(identity(3));
    expect(() => vault.get('b')).toThrow();
  });
  it('过期条目会被清理，不占用容量', () => {
    vi.useFakeTimers();
    const vault = new IdentityVault(10, 1000);
    vault.put('old', identity(1));
    vi.advanceTimersByTime(1001);
    vault.put('new', identity(2));
    expect(vault.size).toBe(1);
    expect(() => vault.get('old')).toThrow();
  });
  it('付款身份记录失败时，微信登录本身仍然成功', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-32-characters-only',
      WECHAT_APP_ID: 'wx_test_app',
      WECHAT_APP_SECRET: 'test-only-secret',
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ openid: 'openid-x', session_key: 'session-key-x' }),
    );
    const session = await createSession('code', config, fetcher, undefined, () => {
      throw new Error('vault unavailable');
    });
    expect(session.token).toBeTruthy();
    expect(session.development).toBe(false);
  });
});

function storeWithProject() {
  const store = new ProjectStore(':memory:', 'cd'.repeat(32));
  stores.push(store);
  const report: EvaluationReport = { ...createDemoReport(), id: randomUUID(), mode: 'live' };
  const project = store.publish('owner', {
    report,
    anonymous: true,
    publicReportConsent: true,
    unlockEnabled: false,
    unlockPriceFen: 8888,
    privateDisclosureConsent: false,
    tipsEnabled: true,
    serviceFeeConsent: true,
  } as never);
  return { store, id: project.id };
}

describe('引荐数按用户去重', () => {
  it('同一用户只计一次，项目方本人和无效项目不计数', () => {
    const { store, id } = storeWithProject();
    expect(store.recordReferral(id, 'visitor-a')).toBe(true);
    expect(store.recordReferral(id, 'visitor-a')).toBe(false);
    expect(store.recordReferral(id, 'owner')).toBe(false);
    expect(store.recordReferral('missing-project-id-0000', 'visitor-b')).toBe(false);
    expect(store.recordReferral(id, 'visitor-b')).toBe(true);
    expect(store.project(id).referrals).toBe(2);
  });
  it('停止公开后不再计数', () => {
    const { store, id } = storeWithProject();
    store.revoke(id, 'owner');
    expect(store.recordReferral(id, 'visitor-a')).toBe(false);
  });
});

describe('浏览数按访客去重', () => {
  it('同一访客在窗口内只计一次，窗口过后重新计数，不同项目分别计数', () => {
    vi.useFakeTimers();
    const counter = new ViewCounter('secret', 1000);
    expect(counter.shouldCount('p1', '1.1.1.1')).toBe(true);
    expect(counter.shouldCount('p1', '1.1.1.1')).toBe(false);
    expect(counter.shouldCount('p2', '1.1.1.1')).toBe(true);
    expect(counter.shouldCount('p1', '2.2.2.2')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(counter.shouldCount('p1', '1.1.1.1')).toBe(true);
  });
  it('满额时淘汰最早的记录', () => {
    const counter = new ViewCounter('secret', 60000, 2);
    counter.shouldCount('p', 'a');
    counter.shouldCount('p', 'b');
    counter.shouldCount('p', 'c');
    expect(counter.shouldCount('p', 'a')).toBe(true);
  });
});

describe('项目方订单分页', () => {
  function seed(store: ProjectStore, projectId: string, count: number) {
    const insert = store.db.prepare(
      "INSERT INTO orders(id,project_id,buyer,kind,amount,status,product,openid,snapshot,contact,message,idem,request_hash,created_at) VALUES(?,?,?,'gift',888,'pending','tip_888','sealed',NULL,'','',?,?,?)",
    );
    const base = Date.parse('2026-10-01T00:00:00Z');
    for (let n = 0; n < count; n++)
      // Every pair shares a timestamp, so ordering must fall back to the id.
      insert.run(
        randomBytes(16).toString('hex'),
        projectId,
        `buyer-${n}`,
        randomUUID(),
        'hash',
        new Date(base + Math.floor(n / 2) * 1000).toISOString(),
      );
  }
  it('按时间倒序分页，翻完不重不漏', () => {
    const { store, id } = storeWithProject();
    seed(store, id, 120);
    const seen: string[] = [];
    let cursor: string | undefined,
      pages = 0;
    do {
      const page = store.orderPage(id, 50, cursor);
      seen.push(...page.rows.map((row) => row.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    const all = store.orderPage(id, 500).rows.map((row) => row.id);
    expect(seen).toEqual(all);
  });
  it('刚好一页时没有下一页游标；篡改游标被拒绝', () => {
    const { store, id } = storeWithProject();
    seed(store, id, 50);
    expect(store.orderPage(id, 50).nextCursor).toBeUndefined();
    expect(() => store.orderPage(id, 50, 'not-a-cursor')).toThrow('订单列表已变化');
    expect(() =>
      store.orderPage(id, 50, Buffer.from("x|' OR 1=1 --").toString('base64url')),
    ).toThrow('订单列表已变化');
  });
});

describe('公开页接口', () => {
  async function fixture() {
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-32-characters-only',
      OWNER_ID_SECRET: 'test-stable-owner-key-32-characters-only',
      PROJECT_SHARING_ENABLED: 'true',
      PROJECT_DATABASE_PATH: ':memory:',
      PROJECT_DATA_KEY: 'ab'.repeat(32),
    });
    const app = await createApp(config);
    apps.push(app);
    const report: EvaluationReport = { ...createDemoReport(), id: randomUUID(), mode: 'live' };
    report.publicationProof = attestReport(report, 'project-owner', config.SESSION_SECRET);
    const owner = { authorization: `Bearer ${issueToken('project-owner', config)}` };
    const published = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: owner,
      payload: {
        report,
        anonymous: true,
        publicReportConsent: true,
        unlockEnabled: false,
        unlockPriceFen: 8888,
        tipsEnabled: false,
        serviceFeeConsent: false,
      },
    });
    expect(published.statusCode).toBe(201);
    return { app, owner, id: published.json().id as string, config };
  }
  it('同一访客反复打开公开页只计一次浏览', async () => {
    const { app, id } = await fixture();
    const view = (ip: string) =>
      app.inject({ method: 'GET', url: `/api/projects/${id}`, remoteAddress: ip });
    expect((await view('10.0.0.1')).json().views).toBe(1);
    expect((await view('10.0.0.1')).json().views).toBe(1);
    expect((await view('10.0.0.2')).json().views).toBe(2);
  });
  it('订单接口返回分页结构，且只有项目方能翻页', async () => {
    const { app, owner, id, config } = await fixture();
    const first = await app.inject({
      method: 'GET',
      url: `/api/projects/${id}/owner`,
      headers: owner,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().orders).toEqual([]);
    expect(first.json().nextCursor).toBeUndefined();
    const stranger = { authorization: `Bearer ${issueToken('someone-else', config)}` };
    const denied = await app.inject({
      method: 'GET',
      url: `/api/projects/${id}/owner/orders?cursor=abc`,
      headers: stranger,
    });
    expect(denied.statusCode).toBeGreaterThanOrEqual(400);
    expect(denied.statusCode).not.toBe(200);
  });
});
