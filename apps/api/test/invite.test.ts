import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInviteScene, makeInviteScene } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const PNG = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

async function fixture(extra: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-32-characters-only',
    WECHAT_APP_ID: 'wx_test_app',
    WECHAT_APP_SECRET: 'test-only-secret',
    PUBLIC_WEB_URL: 'https://example.invalid',
    ...extra,
  });
  const bodies: Record<string, unknown>[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === '/cgi-bin/stable_token')
      return Response.json({ access_token: 'test-access', expires_in: 7200 });
    if (url.pathname === '/wxa/getwxacodeunlimit') {
      const body = JSON.parse(String(options?.body));
      bodies.push(body);
      // Real WeChat returns JPEG by default, and may label transparent PNG as JPEG too.
      return new Response(body.is_hyaline === true ? PNG : JPEG, {
        headers: { 'content-type': 'image/jpeg' },
      });
    }
    throw new Error('Unexpected official endpoint');
  });
  const app = await createApp(config, { wechatFetch: fetcher });
  apps.push(app);
  return { app, bodies };
}

describe('海报邀请码', () => {
  it('邀请码只携带行业与轮次，打开首页；同一组合复用同一张码', async () => {
    const { app, bodies } = await fixture();
    const first = await app.inject({ url: '/api/invite/code.png?industry=saas&round=pre-a' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toContain('image/png');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ scene: 'i.saas.pre-a', page: 'pages/index/index' });
    await app.inject({ url: '/api/invite/code.png?industry=saas&round=pre-a' });
    expect(bodies).toHaveLength(1);
  });
  it('拒绝未知行业或轮次；未配置小程序时不伪造二维码', async () => {
    const { app } = await fixture();
    expect((await app.inject({ url: '/api/invite/code.png?industry=x&round=a' })).statusCode).toBe(400);
    const bare = await fixture({ WECHAT_APP_ID: '', WECHAT_APP_SECRET: '' });
    const missing = await bare.app.inject({ url: '/api/invite/code.png?industry=ai&round=a' });
    expect(missing.statusCode).toBe(503);
    const web = await bare.app.inject({
      url: '/api/invite/code.png?industry=ai&round=a&format=web',
    });
    expect(web.statusCode).toBe(200);
  });
  it('开发版返回真实 PNG；正式版仍保留页面校验', async () => {
    const { app, bodies } = await fixture({ MINIPROGRAM_ENV: 'develop' });
    const response = await app.inject({ url: '/api/invite/code.png?industry=saas&round=pre-a' });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(PNG);
    expect(bodies[0]).toMatchObject({ env_version: 'develop', check_path: false });
    const formal = await fixture();
    await formal.app.inject({ url: '/api/invite/code.png?industry=saas&round=pre-a' });
    expect(formal.bodies[0]).toMatchObject({ env_version: 'release', check_path: true });
  });
  it('场景值可以往返解析，其他内容一律拒绝', () => {
    expect(readInviteScene(makeInviteScene({ industry: 'health', round: 'seed' }))).toEqual({
      industry: 'health',
      round: 'seed',
    });
    expect(readInviteScene(encodeURIComponent('i.ai.angel'))).toEqual({
      industry: 'ai',
      round: 'angel',
    });
    for (const bad of ['i.ai', 'i.unknown.angel', 'x.ai.angel', 'i.ai.angel.extra', 42, '%E0%A4%A'])
      expect(readInviteScene(bad)).toBeUndefined();
  });
});
