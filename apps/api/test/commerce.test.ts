import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createDemoReport } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { loadConfig } from '../src/config';
import { attestReport } from '../src/report-proof';
import { parseWechatXml, WechatNotifyCrypto } from '../src/wechat-notify';
import { ProjectStore } from '../src/project-store';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of directories.splice(0)) {
    if (
      !resolve(dir).startsWith(resolve(tmpdir()) + sep) ||
      !basename(dir).startsWith('pitchcoach-share-test-')
    )
      throw new Error('Unexpected test cleanup target');
    await rm(dir, { recursive: true, force: true });
  }
});
const privatePack = {
  overview: '这里是只向购买者披露的完整项目正文与尚未公开的完整产品计划，需要购买核实后才能看到。',
  contactName: '私密联系人甲',
  contactChannel: 'wechat' as const,
  contactValue: 'secret-contact-abc',
};
async function fixture(extra: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-32-characters-only',
    OWNER_ID_SECRET: 'test-stable-owner-key-32-characters-only',
    PROJECT_SHARING_ENABLED: 'true',
    PROJECT_DATABASE_PATH: ':memory:',
    PROJECT_DATA_KEY: 'ab'.repeat(32),
    WECHAT_APP_ID: 'wx_test_app',
    WECHAT_APP_SECRET: 'test-only-secret',
    VIRTUALPAY_ENABLED: 'true',
    VIRTUALPAY_OFFER_ID: 'test-offer',
    VIRTUALPAY_APP_KEY: 'test-only-virtual-key',
    VIRTUALPAY_PRODUCTS: JSON.stringify({ 'unlock:8888': 'unlock_8888', 'tip:888': 'tip_888' }),
    WECHAT_MESSAGE_TOKEN: 'AAAAA',
    WECHAT_ENCODING_AES_KEY: Buffer.alloc(32, 7).toString('base64').slice(0, -1),
    PROJECT_SETTLEMENT_READY: 'true',
    PUBLIC_WEB_URL: 'https://example.invalid',
    ...extra,
  });
  const remote = new Map<
    string,
    { status: number; fee: number; refund?: number; receipt?: number | null; channel?: number }
  >();
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === '/sns/jscode2session')
      return Response.json({
        openid: url.searchParams.get('js_code'),
        session_key: 'test-session-key',
      });
    if (url.pathname === '/cgi-bin/stable_token')
      return Response.json({ access_token: 'test-access', expires_in: 7200 });
    if (url.pathname.startsWith('/xpay/')) {
      const body = String(options?.body),
        expected = createHmac('sha256', config.VIRTUALPAY_APP_KEY)
          .update(`${url.pathname}&${body}`)
          .digest('hex');
      expect(url.searchParams.get('pay_sig')).toBe(expected);
      const parsed = JSON.parse(body);
      if (url.pathname === '/xpay/notify_provide_goods') return Response.json({ errcode: 0 });
      const state = remote.get(parsed.order_id) || { status: 1, fee: 8888 };
      return Response.json({
        errcode: 0,
        order: {
          order_id: parsed.order_id,
          status: state.status,
          order_type: 0,
          order_fee: state.fee,
          paid_fee: state.receipt === null ? undefined : (state.receipt ?? state.fee),
          refund_fee: state.refund || 0,
          ...(state.channel === undefined
            ? {}
            : { platform_fee_fen: state.channel, cps_fee_fen: 0 }),
          env_type: 0,
          wx_order_id: `wx_${parsed.order_id}`,
        },
      });
    }
    if (url.pathname === '/wxa/getwxacodeunlimit')
      return new Response(Buffer.from('89504e470d0a1a0a0000000000000000', 'hex'), {
        headers: { 'content-type': 'image/png' },
      });
    throw new Error('Unexpected official endpoint');
  });
  const app = await createApp(config, { wechatFetch: fetcher });
  apps.push(app);
  const report: EvaluationReport = { ...createDemoReport(), id: randomUUID(), mode: 'live' };
  report.publicationProof = attestReport(report, 'project-owner', config.SESSION_SECRET);
  const owner = { authorization: `Bearer ${issueToken('project-owner', config)}` };
  const publish = {
    report,
    anonymous: true,
    publicReportConsent: true,
    unlockEnabled: true,
    unlockPriceFen: 8888,
    privatePack,
    privateDisclosureConsent: true,
    tipsEnabled: true,
    serviceFeeConsent: true,
  };
  const published = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: owner,
    payload: publish,
  });
  expect(published.statusCode).toBe(201);
  const project = published.json();
  const login = async (code: string) => {
    const session = await app.inject({ method: 'POST', url: '/api/session', payload: { code } });
    return { authorization: `Bearer ${session.json().token}` };
  };
  const buyer = await login('buyer-one'),
    other = await login('buyer-two');
  const purchase = {
    kind: 'unlock',
    amountFen: 8888,
    expectedRevision: 1,
    role: 'investor',
    purchaseConsent: true,
    idempotencyKey: randomUUID(),
  };
  const notify = async (xml: string) => {
    const crypto = new WechatNotifyCrypto(
        config.WECHAT_MESSAGE_TOKEN,
        config.WECHAT_ENCODING_AES_KEY,
        config.WECHAT_APP_ID,
      ),
      envelope = parseWechatXml(crypto.encode(xml));
    const query = new URLSearchParams({
      msg_signature: envelope.MsgSignature,
      timestamp: envelope.TimeStamp,
      nonce: envelope.Nonce,
    });
    return app.inject({
      method: 'POST',
      url: `/api/payments/virtual/notify?${query}`,
      headers: { 'content-type': 'application/xml' },
      payload: `<xml><Encrypt><![CDATA[${envelope.Encrypt}]]></Encrypt></xml>`,
    });
  };
  return {
    app,
    config,
    report,
    owner,
    buyer,
    other,
    publish,
    project,
    purchase,
    remote,
    notify,
    fetcher,
  };
}

describe('公开项目与真实支付权限边界', () => {
  it('完整评估免费，私密正文、联系人、签发凭证和所有者标识不在公开响应中', async () => {
    const f = await fixture();
    const response = await f.app.inject(`/api/projects/${f.project.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().report.investors).toHaveLength(3);
    expect(response.json().report.dimensions).toHaveLength(8);
    for (const secret of [
      privatePack.overview,
      privatePack.contactName,
      privatePack.contactValue,
      'publicationProof',
      'project-owner',
    ])
      expect(response.body).not.toContain(secret);
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.other }))
        .statusCode,
    ).toBe(404);
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/access`, headers: f.buyer })).json()
        .unlocked,
    ).toBe(false);
  });
  it('不能替别人发布、伪造评分或跳过私密披露确认', async () => {
    const f = await fixture();
    for (const [headers, payload] of [
      [f.other, f.publish],
      [f.owner, { ...f.publish, report: { ...f.report, score: 100 } }],
      [f.owner, { ...f.publish, report: { ...f.report, publicationProof: undefined } }],
    ] as const)
      expect(
        (await f.app.inject({ method: 'POST', url: '/api/projects', headers, payload })).statusCode,
      ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: f.owner,
          payload: { ...f.publish, privateDisclosureConsent: false },
        })
      ).statusCode,
    ).toBe(400);
    const fresh = await fixture();
    expect(
      (
        await fresh.app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: fresh.owner,
          payload: { ...fresh.publish, report: { ...fresh.report, publicationProof: 123 } },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fresh.app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: fresh.owner,
          payload: { ...fresh.publish, publicReportConsent: false },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('未付款时不提供资料，金额与已发布商品在服务端绑定，前端声称成功没有作用', async () => {
    const f = await fixture();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/projects/${f.project.id}/orders`,
          headers: f.buyer,
          payload: { ...f.purchase, amountFen: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const result = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: { ...f.purchase, paid: true },
    });
    expect(result.statusCode).toBe(201);
    const { order, payment } = result.json();
    expect(JSON.parse(payment.signData)).toMatchObject({
      goodsPrice: 8888,
      productId: 'unlock_8888',
      outTradeNo: order.id,
      env: 0,
      buyQuantity: 1,
    });
    expect(
      (await f.app.inject({ url: `/api/orders/${order.id}/material`, headers: f.buyer }))
        .statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ url: `/api/orders/${order.id}`, headers: f.other })).statusCode,
    ).toBe(404);
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/access`, headers: f.buyer })).json()
        .unlocked,
    ).toBe(false);
  });
  it('订单幂等，篡改同一请求参数拒绝；不允许项目方买自己或未授权留联系方式', async () => {
    const f = await fixture();
    const request = {
      method: 'POST' as const,
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    };
    const a = await f.app.inject(request),
      b = await f.app.inject(request);
    expect(a.json().order.id).toBe(b.json().order.id);
    expect(
      (await f.app.inject({ ...request, payload: { ...f.purchase, message: 'changed' } }))
        .statusCode,
    ).toBe(409);
    expect((await f.app.inject({ ...request, headers: f.owner })).statusCode).toBe(400);
    expect(
      (
        await f.app.inject({
          ...request,
          payload: { ...f.purchase, idempotencyKey: randomUUID(), contact: '未授权的联系方式' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('已验签并核实微信金额的通知才开放资料，重复通知不重复记账', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    });
    const id = created.json().order.id;
    f.remote.set(id, { status: 2, fee: 8888 });
    const xml = `<xml><MsgType>event</MsgType><Event>xpay_goods_deliver_notify</Event><OpenId>buyer-one</OpenId><OutTradeNo>${id}</OutTradeNo><Env>0</Env></xml>`;
    expect((await f.notify(xml)).statusCode).toBe(200);
    expect((await f.notify(xml)).statusCode).toBe(200);
    const material = await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer });
    expect(material.statusCode).toBe(200);
    expect(material.json()).toEqual(privatePack);
    const owner = (
      await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })
    ).json();
    expect(owner.grossPaidFen).toBe(8888);
    expect(owner.orders).toHaveLength(1);
  });
  it('微信订单金额不符时拒绝发货，未经签名或明文回调拒绝', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    });
    const id = created.json().order.id;
    f.remote.set(id, { status: 2, fee: 1 });
    expect(
      (
        await f.notify(
          `<xml><MsgType>event</MsgType><Event>xpay_goods_deliver_notify</Event><OpenId>buyer-one</OpenId><OutTradeNo>${id}</OutTradeNo><Env>0</Env></xml>`,
        )
      ).statusCode,
    ).toBe(502);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/payments/virtual/notify?msg_signature=bad&timestamp=1714036504&nonce=1',
          headers: { 'content-type': 'application/xml' },
          payload: '<xml><Encrypt>bad</Encrypt></xml>',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer })).statusCode,
    ).not.toBe(200);
  });
  it('退款通知幂等、权限撤销，旧支付通知不能重新开放；联系方式不随退款继续展示', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: { ...f.purchase, contact: 'buyer-private-contact', shareContactConsent: true },
    });
    const id = created.json().order.id;
    f.remote.set(id, { status: 2, fee: 8888 });
    const delivery = `<xml><MsgType>event</MsgType><Event>xpay_goods_deliver_notify</Event><OpenId>buyer-one</OpenId><OutTradeNo>${id}</OutTradeNo><Env>0</Env></xml>`;
    await f.notify(delivery);
    const refund = `<xml><MsgType>event</MsgType><Event>xpay_refund_notify</Event><OpenId>buyer-one</OpenId><MchOrderId>${id}</MchOrderId><WxRefundId>refund_${id}</WxRefundId><RefundFee>8888</RefundFee><RetCode>0</RetCode><Env>0</Env></xml>`;
    expect((await f.notify(refund)).statusCode).toBe(200);
    expect((await f.notify(refund)).statusCode).toBe(200);
    await f.notify(delivery);
    expect(
      (await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer })).statusCode,
    ).toBe(403);
    const owner = (
      await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })
    ).json();
    expect(owner.refundFen).toBe(8888);
    expect(owner.orders[0].contact).toBe('');
  });
  it('改价需重新确认，新价位未发布时不收款，旧订单保留价格和已购买资料', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    });
    const id = created.json().order.id;
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/projects/${f.project.id}/settings`,
          headers: f.owner,
          payload: { expectedRevision: 1, unlockPriceFen: 12345, tipsEnabled: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/projects/${f.project.id}/orders`,
          headers: f.other,
          payload: { ...f.purchase, idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
    const unavailable = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.other,
      payload: {
        ...f.purchase,
        amountFen: 12345,
        expectedRevision: 2,
        idempotencyKey: randomUUID(),
      },
    });
    expect(unavailable.json().error.code).toBe('PRICE_NOT_ENABLED');
    f.remote.set(id, { status: 2, fee: 8888 });
    await f.app.inject({ url: `/api/orders/${id}`, headers: f.buyer });
    expect(
      (await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer })).json(),
    ).toEqual(privatePack);
    expect(
      (
        await f.app.inject({
          method: 'DELETE',
          url: `/api/projects/${f.project.id}`,
          headers: f.owner,
        })
      ).statusCode,
    ).toBe(204);
    expect((await f.app.inject(`/api/projects/${f.project.id}`)).statusCode).toBe(404);
    expect(
      (await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer })).statusCode,
    ).toBe(200);
    expect((await f.app.inject(`/api/projects/${f.project.id}/code.png`)).statusCode).toBe(404);
  });
  it('非专业用户可选固定打赏，联系方式只对项目方且在付款核验后可见', async () => {
    const f = await fixture();
    const input = {
      ...f.purchase,
      kind: 'tip',
      role: 'supporter',
      amountFen: 888,
      contact: 'supporter-private-contact',
      shareContactConsent: true,
      message: '期待产品上线',
    };
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().order.id;
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })).body,
    ).not.toContain(input.contact);
    f.remote.set(id, { status: 2, fee: 888 });
    await f.app.inject({ url: `/api/orders/${id}`, headers: f.buyer });
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })).body,
    ).toContain(input.contact);
    expect((await f.app.inject(`/api/projects/${f.project.id}`)).body).not.toContain(input.contact);
    expect(
      (await f.app.inject({ url: `/api/orders/${id}/material`, headers: f.buyer })).statusCode,
    ).toBe(403);
  });
  it('官方小程序码只携带公开 ID，拒绝撤回后取码；非公开码失败不返回假码', async () => {
    const f = await fixture();
    const image = await f.app.inject(`/api/projects/${f.project.id}/code.png`);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    const call = f.fetcher.mock.calls.find(([url]) => String(url).includes('getwxacodeunlimit'));
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body).toMatchObject({ scene: f.project.id, page: 'pages/project/index' });
    expect(body.scene.length).toBeLessThanOrEqual(32);
    expect(JSON.stringify(body)).not.toContain('secret-contact');
  });
  it('每笔按已核实实收扣退款收取 5%，优惠不计作实收；渠道费独立对账', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    });
    const id = created.json().order.id;
    f.remote.set(id, { status: 2, fee: 8888, receipt: 6000, channel: 30 });
    await f.app.inject({ url: `/api/orders/${id}`, headers: f.buyer });
    const read = async () =>
      (await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })).json();
    expect(await read()).toMatchObject({
      grossPaidFen: 8888,
      verifiedReceiptsFen: 6000,
      netReceiptsFen: 6000,
      platformFeeFen: 300,
      projectShareFen: 5700,
      channelFeeFen: 30,
      unreconciledOrders: 0,
      channelFeePendingOrders: 0,
      settlement: 'pending_external',
    });
    const refund = `<xml><MsgType>event</MsgType><Event>xpay_refund_notify</Event><OpenId>buyer-one</OpenId><MchOrderId>${id}</MchOrderId><WxRefundId>partial_${id}</WxRefundId><RefundFee>1000</RefundFee><RetCode>0</RetCode><Env>0</Env></xml>`;
    expect((await f.notify(refund)).statusCode).toBe(200);
    expect((await f.notify(refund)).statusCode).toBe(200);
    expect(await read()).toMatchObject({
      refundFen: 1000,
      netReceiptsFen: 5000,
      platformFeeFen: 250,
      projectShareFen: 4750,
    });
  });
  it('没有微信实收字段的订单不按标价计费；未确认服务费不能开启收款', async () => {
    const f = await fixture();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: f.owner,
          payload: { ...f.publish, serviceFeeConsent: false },
        })
      ).statusCode,
    ).toBe(400);
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/projects/${f.project.id}/orders`,
      headers: f.buyer,
      payload: f.purchase,
    });
    const id = created.json().order.id;
    f.remote.set(id, { status: 2, fee: 8888, receipt: null });
    await f.app.inject({ url: `/api/orders/${id}`, headers: f.buyer });
    expect(
      (await f.app.inject({ url: `/api/projects/${f.project.id}/owner`, headers: f.owner })).json(),
    ).toMatchObject({
      grossPaidFen: 8888,
      verifiedReceiptsFen: 0,
      platformFeeFen: 0,
      projectShareFen: 0,
      unreconciledOrders: 1,
      channelFeePendingOrders: 1,
    });
  });
  it('仅虚构白名单场景可生成演示二维码；未配置域名不伪造入口', async () => {
    const f = await fixture();
    const scene = 'd~ai~angel~8888~1~012';
    const response = await f.app.inject(
      `/api/demo/code.png?format=web&scene=${encodeURIComponent(scene)}`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(
      (await f.app.inject('/api/demo/code.png?format=web&scene=secret-project-contact')).statusCode,
    ).toBe(400);
    const noWeb = await fixture({ PUBLIC_WEB_URL: '' });
    expect(
      (await noWeb.app.inject(`/api/demo/code.png?format=web&scene=${encodeURIComponent(scene)}`))
        .statusCode,
    ).toBe(503);
  });
});

describe('持久化与通知密码学', () => {
  it('BP与联系方式加密落盘，重启可解密，记录不能跨上下文调包', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pitchcoach-share-test-'));
    directories.push(dir);
    const path = join(dir, 'projects.sqlite'),
      key = randomBytes(32).toString('hex');
    let store = new ProjectStore(path, key);
    const encrypted = store.seal(privatePack, 'project:one');
    store.db.exec('CREATE TABLE test_secrets(value TEXT)');
    store.db.prepare('INSERT INTO test_secrets VALUES(?)').run(encrypted);
    store.close();
    const bytes = await readFile(path);
    expect(bytes.includes(Buffer.from(privatePack.contactValue))).toBe(false);
    store = new ProjectStore(path, key);
    expect(store.unseal(encrypted, 'project:one')).toEqual(privatePack);
    expect(() => store.unseal(encrypted, 'project:two')).toThrow();
    store.close();
  });
  it('使用官方 URL 校验向量，拒绝改文、错 AppID 与实体声明', () => {
    const key = Buffer.alloc(32, 7).toString('base64').slice(0, -1),
      crypto = new WechatNotifyCrypto('AAAAA', key, 'wx_test');
    expect(crypto.signature('1714036504', '1514711492')).toBe(
      'f464b24fc39322e44b38aa78f5edd27bd1441696',
    );
    const message = '<xml><Event>xpay_goods_deliver_notify</Event></xml>',
      encoded = parseWechatXml(crypto.encode(message));
    expect(crypto.decrypt(encoded.Encrypt)).toBe(message);
    expect(() =>
      new WechatNotifyCrypto('AAAAA', key, 'wx_wrong').decrypt(encoded.Encrypt),
    ).toThrow();
    expect(() =>
      crypto.verify('0'.repeat(40), encoded.TimeStamp, encoded.Nonce, encoded.Encrypt),
    ).toThrow();
    expect(() => parseWechatXml('<!DOCTYPE xml [<!ENTITY a "bad">]><xml>&a;</xml>')).toThrow();
  });
});
