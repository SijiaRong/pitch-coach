import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  createOrderSchema,
  publishProjectSchema,
  shareIdSchema,
  PRICE_PRESETS_FEN,
  SERVICE_FEE_RATE_BPS,
  makeDemoScene,
  readDemoScene,
  getGift,
} from '@pitchcoach/shared';
import type { PrivateProjectPack, PublishedProject } from '@pitchcoach/shared';
import { requireOwner } from './auth';
import type { Config } from './config';
import { PublicError } from './errors';
import { ProjectStore, orderDto } from './project-store';
import type { OrderRow, ProjectRow } from './project-store';
import { verifyReportProof } from './report-proof';
import { IdentityVault, WechatApi } from './wechat-api';
import { VirtualPayment } from './virtual-payment';
import { parseWechatXml, WechatNotifyCrypto } from './wechat-notify';

export function registerCommerce(
  app: FastifyInstance,
  config: Config,
  identities: IdentityVault,
  fetcher: typeof fetch = fetch,
) {
  const api = new WechatApi(config, fetcher);
  const store =
    config.sharingEnabled || config.cloudStorageEnabled
      ? new ProjectStore(config.PROJECT_DATABASE_PATH, config.PROJECT_DATA_KEY)
      : undefined;
  const payments = store ? new VirtualPayment(config, api, identities, store) : undefined;
  const notifyCrypto = config.paymentEnabled
    ? new WechatNotifyCrypto(
        config.WECHAT_MESSAGE_TOKEN,
        config.WECHAT_ENCODING_AES_KEY,
        config.WECHAT_APP_ID,
      )
    : undefined;
  const requireStore = () => {
    if (!store || !config.sharingEnabled)
      throw new PublicError(
        503,
        'SHARING_NOT_CONFIGURED',
        '公开分享服务尚未配置，可先体验虚构项目',
      );
    return store;
  };
  const params = z.object({ id: shareIdSchema });
  const orderParams = z.object({ id: z.string().regex(/^[a-f\d]{32}$/) });
  const codes = new Map<string, Promise<Buffer>>();
  const miniCode = (scene: string) => {
    const existing = codes.get(scene);
    if (existing) return existing;
    const work = api.miniCode(scene).finally(() => codes.delete(scene));
    codes.set(scene, work);
    return work;
  };
  const dto = (row: ProjectRow): PublishedProject => ({
    id: row.id,
    mode: 'live',
    report: JSON.parse(row.report),
    anonymous: Boolean(row.anonymous),
    unlockEnabled: Boolean(row.unlock_enabled),
    unlockPriceFen: row.price,
    tipsEnabled: Boolean(row.tips_enabled),
    createdAt: row.created_at,
    revision: row.revision,
    views: row.views,
    referrals: row.referrals,
    paymentAvailable: config.paymentEnabled,
    shareCodeAvailable: Boolean(config.WECHAT_APP_ID && config.WECHAT_APP_SECRET),
    purchasableUnlock: payments?.available('unlock', row.price) ?? false,
    purchasableTipPricesFen: PRICE_PRESETS_FEN.filter((amount) =>
      payments?.available('gift', amount),
    ),
    serviceFeeRateBps: SERVICE_FEE_RATE_BPS,
  });
  const timer = setInterval(() => {
    void payments?.reconcile();
  }, 60000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    identities.clear();
    store?.close();
  });
  app.get('/api/commerce/config', async () => ({
    sharingAvailable: config.sharingEnabled,
    paymentAvailable: config.paymentEnabled,
    miniCodeAvailable: Boolean(config.WECHAT_APP_ID && config.WECHAT_APP_SECRET),
    webCodeAvailable: Boolean(config.PUBLIC_WEB_URL),
    webCodeLocal: Boolean(
      config.PUBLIC_WEB_URL &&
        ['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.PUBLIC_WEB_URL).hostname),
    ),
    settlement: 'pending_external',
    serviceFeeRateBps: SERVICE_FEE_RATE_BPS,
  }));
  // Synthetic example only: no personal report, BP, contact or real transaction is encoded.
  app.get(
    '/api/demo/code.png',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({ scene: z.string().max(32), format: z.enum(['mini', 'web']).default('mini') })
        .parse(request.query);
      const scene = readDemoScene(input.scene);
      if (!scene) throw new PublicError(400, 'DEMO_SCENE_INVALID', '示例入口参数无效');
      if (input.format === 'mini')
        return reply.type('image/png').send(await miniCode(makeDemoScene(scene)));
      if (!config.PUBLIC_WEB_URL)
        throw new PublicError(503, 'WEB_SHARE_NOT_CONFIGURED', '公开网页地址尚未配置');
      return reply
        .type('image/png')
        .send(
          await QRCode.toBuffer(
            `${config.PUBLIC_WEB_URL.replace(/\/$/, '')}/#/pages/project/index?scene=${encodeURIComponent(makeDemoScene(scene))}`,
            { width: 430, margin: 4, errorCorrectionLevel: 'M' },
          ),
        );
    },
  );
  app.post(
    '/api/projects',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const owner = requireOwner(request, config),
        input = publishProjectSchema.parse(request.body);
      if (
        input.report.mode !== 'live' ||
        !verifyReportProof(input.report, owner, config.SESSION_SECRET)
      )
        throw new PublicError(
          403,
          'REPORT_PROOF_REQUIRED',
          '请使用本人真实评估结果公开；旧报告需重新评估，示例请使用演示入口',
        );
      return reply.code(201).send(dto(requireStore().publish(owner, input)));
    },
  );
  app.get('/api/projects/:id', async (request) => {
    const { id } = params.parse(request.params),
      db = requireStore();
    const project = db.project(id);
    db.db.prepare('UPDATE projects SET views=views+1 WHERE id=?').run(id);
    return dto({ ...project, views: project.views + 1 });
  });
  app.get('/api/projects/:id/owner', async (request) => {
    const owner = requireOwner(request, config),
      { id } = params.parse(request.params),
      db = requireStore();
    const project = db.owned(id, owner);
    const orders = db.db
      .prepare('SELECT * FROM orders WHERE project_id=? ORDER BY created_at DESC LIMIT 1000')
      .all(id) as unknown as OrderRow[];
    return {
      project: dto(project),
      active: Boolean(project.active),
      orders: orders.map((order) => ({
        ...orderDto(order),
        contact:
          order.status === 'paid' && order.contact
            ? db.unseal(order.contact, `order:${order.id}:contact`)
            : '',
        message:
          order.status === 'paid' && order.message
            ? db.unseal(order.message, `order:${order.id}:message`)
            : '',
      })),
      ...db.revenue(id),
      settlement: 'pending_external',
    };
  });
  app.post('/api/projects/:id/settings', async (request) => {
    const owner = requireOwner(request, config),
      { id } = params.parse(request.params),
      db = requireStore();
    const row = db.owned(id, owner);
    const input = z
      .object({
        expectedRevision: z.number().int(),
        unlockPriceFen: z.number().int().min(1).max(9999999),
        tipsEnabled: z.boolean(),
        serviceFeeConsent: z.boolean().default(false),
      })
      .parse(request.body);
    if (!row.active || input.expectedRevision !== row.revision)
      throw new PublicError(409, 'PROJECT_CHANGED', '项目设置已变化，请刷新后重试');
    if (
      (row.unlock_enabled || input.tipsEnabled) &&
      !row.fee_consented_at &&
      !input.serviceFeeConsent
    )
      throw new PublicError(400, 'FEE_CONSENT_REQUIRED', '请确认平台收款及 5% 服务费规则');
    db.db
      .prepare(
        'UPDATE projects SET price=?,tips_enabled=?,fee_consented_at=COALESCE(fee_consented_at,?),revision=revision+1 WHERE id=? AND revision=?',
      )
      .run(
        input.unlockPriceFen,
        Number(input.tipsEnabled),
        input.serviceFeeConsent ? new Date().toISOString() : null,
        id,
        row.revision,
      );
    return dto(db.project(id));
  });
  app.delete('/api/projects/:id', async (request, reply) => {
    const owner = requireOwner(request, config),
      { id } = params.parse(request.params);
    requireStore().revoke(id, owner);
    return reply.code(204).send();
  });
  app.get('/api/commerce/mine', async (request) => {
    const owner = requireOwner(request, config),
      db = requireStore();
    return {
      projects: (
        db.db
          .prepare('SELECT * FROM projects WHERE owner=? ORDER BY created_at DESC LIMIT 100')
          .all(owner) as unknown as ProjectRow[]
      ).map((row) => ({ ...dto(row), active: Boolean(row.active) })),
      orders: (
        db.db
          .prepare('SELECT * FROM orders WHERE buyer=? ORDER BY created_at DESC LIMIT 300')
          .all(owner) as unknown as OrderRow[]
      ).map(orderDto),
    };
  });
  app.get('/api/projects/:id/access', async (request) => {
    const owner = requireOwner(request, config),
      { id } = params.parse(request.params),
      db = requireStore(),
      project = db.project(id);
    if (project.owner === owner)
      return {
        isOwner: true,
        unlocked: true,
        privatePack: project.pack
          ? db.unseal<PrivateProjectPack>(project.pack, `project:${id}`)
          : undefined,
      };
    const entitlement = db.entitlement(id, owner);
    if (!entitlement) return { isOwner: false, unlocked: false };
    const checked = await payments!.check(entitlement);
    return checked.status === 'paid'
      ? { isOwner: false, unlocked: true, privatePack: db.privatePack(checked) }
      : { isOwner: false, unlocked: false };
  });
  app.post(
    '/api/projects/:id/orders',
    { config: { rateLimit: { max: 15, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const buyer = requireOwner(request, config),
        { id } = params.parse(request.params),
        input = createOrderSchema.parse(request.body),
        db = requireStore();
      const project = db.project(id);
      if (project.owner === buyer)
        throw new PublicError(400, 'OWN_PROJECT', '不能向自己的项目购买资料或送礼');
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ id, ...input }))
        .digest('hex');
      const duplicate = db.db
        .prepare('SELECT * FROM orders WHERE buyer=? AND idem=?')
        .get(buyer, input.idempotencyKey) as unknown as OrderRow | undefined;
      if (duplicate) {
        if (duplicate.request_hash !== requestHash)
          throw new PublicError(409, 'IDEMPOTENCY_CONFLICT', '同一请求编号不能用于不同购买');
        return {
          order: orderDto(duplicate),
          ...(duplicate.status === 'pending'
            ? { payment: payments!.parameters(duplicate, buyer) }
            : {}),
        };
      }
      if (
        project.revision !== input.expectedRevision ||
        (input.kind === 'unlock' && project.price !== input.amountFen)
      )
        throw new PublicError(409, 'PRICE_CHANGED', '价格或公开设置已变化，请确认新价格后重试');
      if (
        (input.kind === 'unlock' && (!project.unlock_enabled || !project.pack)) ||
        (input.kind === 'gift' && !project.tips_enabled)
      )
        throw new PublicError(409, 'OFFER_DISABLED', '项目方未开放本项服务');
      if (!project.fee_consented_at)
        throw new PublicError(409, 'FEE_CONSENT_REQUIRED', '项目方尚未确认收款及服务费规则');
      if (input.kind === 'unlock' && db.entitlement(id, buyer))
        throw new PublicError(409, 'ALREADY_UNLOCKED', '你已解锁此项目，无需重复购买');
      const product = payments!.product(input.kind, input.amountFen),
        identity = payments!.identity(buyer),
        orderId = randomBytes(16).toString('hex');
      const pack =
        input.kind === 'unlock'
          ? db.unseal<PrivateProjectPack>(project.pack!, `project:${id}`)
          : undefined;
      const pending = db.db
        .prepare("SELECT count(*) AS n FROM orders WHERE buyer=? AND status='pending'")
        .get(buyer) as { n: number };
      if (pending.n >= 20)
        throw new PublicError(429, 'ORDER_LIMIT', '未完成订单过多，请先处理已有订单');
      db.db
        .prepare(
          "INSERT INTO orders(id,project_id,buyer,kind,amount,status,product,openid,snapshot,contact,message,idem,request_hash,created_at,gift_id,gift_name) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          orderId,
          id,
          buyer,
          input.kind,
          input.amountFen,
          product,
          db.seal(identity.openid, `order:${orderId}:openid`),
          pack ? db.seal(pack, `order:${orderId}:pack`) : null,
          input.contact ? db.seal(input.contact, `order:${orderId}:contact`) : '',
          input.message ? db.seal(input.message, `order:${orderId}:message`) : '',
          input.idempotencyKey,
          requestHash,
          new Date().toISOString(),
          input.giftId ?? null,
          getGift(input.giftId)?.name ?? null,
        );
      const order = db.order(orderId);
      return reply
        .code(201)
        .send({ order: orderDto(order), payment: payments!.parameters(order, buyer) });
    },
  );
  app.get('/api/orders/:id', async (request) => {
    const owner = requireOwner(request, config),
      { id } = orderParams.parse(request.params),
      db = requireStore();
    return orderDto(await payments!.check(db.orderFor(id, owner)));
  });
  app.get('/api/orders/:id/material', async (request) => {
    const owner = requireOwner(request, config),
      { id } = orderParams.parse(request.params),
      db = requireStore();
    return db.privatePack(await payments!.check(db.orderFor(id, owner)));
  });
  app.get(
    '/api/projects/:id/code.png',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = params.parse(request.params),
        { format } = z
          .object({ format: z.enum(['mini', 'web']).default('mini') })
          .parse(request.query),
        db = requireStore(),
        project = db.project(id);
      if (format === 'web') {
        if (!config.PUBLIC_WEB_URL)
          throw new PublicError(503, 'WEB_SHARE_NOT_CONFIGURED', '公开网页地址尚未配置');
        return reply
          .type('image/png')
          .send(
            await QRCode.toBuffer(
              `${config.PUBLIC_WEB_URL.replace(/\/$/, '')}/#/pages/project/index?share=${id}`,
              { width: 430, margin: 4, errorCorrectionLevel: 'M' },
            ),
          );
      }
      const code = project.code ? Buffer.from(project.code, 'base64') : await miniCode(id);
      if (!project.code)
        db.db
          .prepare('UPDATE projects SET code=? WHERE id=? AND active=1')
          .run(code.toString('base64'), id);
      db.project(id); // A revoke while awaiting WeChat must also stop this response.
      return reply.type('image/png').send(code);
    },
  );
  if (notifyCrypto && payments) {
    app.addContentTypeParser(
      ['text/xml', 'application/xml'],
      { parseAs: 'string' },
      (_request, body, done) => done(null, body),
    );
    const querySchema = z.object({
      signature: z.string().max(100).optional(),
      msg_signature: z.string().max(100).optional(),
      timestamp: z.string().regex(/^\d{1,12}$/),
      nonce: z.string().min(1).max(128),
      echostr: z.string().max(4096).optional(),
    });
    app.get('/api/payments/virtual/notify', async (request, reply) => {
      const query = querySchema.parse(request.query);
      if (!query.echostr) throw new PublicError(400, 'INVALID_CHALLENGE', '缺少校验内容');
      if (query.msg_signature) {
        notifyCrypto.verify(query.msg_signature, query.timestamp, query.nonce, query.echostr);
        return reply.type('text/plain').send(notifyCrypto.decrypt(query.echostr));
      }
      notifyCrypto.verify(query.signature || '', query.timestamp, query.nonce);
      return reply.type('text/plain').send(query.echostr);
    });
    app.post('/api/payments/virtual/notify', { bodyLimit: 65536 }, async (request, reply) => {
      const query = querySchema.parse(request.query);
      if (typeof request.body !== 'string')
        throw new PublicError(400, 'NOTIFY_FORMAT', '请在微信后台使用 XML 安全模式消息推送');
      const envelope = parseWechatXml(request.body);
      if (typeof envelope.Encrypt !== 'string')
        throw new PublicError(403, 'ENCRYPTION_REQUIRED', '需要加密通知');
      notifyCrypto.verify(
        query.msg_signature || '',
        query.timestamp,
        query.nonce,
        envelope.Encrypt,
      );
      const message = parseWechatXml(notifyCrypto.decrypt(envelope.Encrypt));
      const response = await payments.notify(message);
      return reply
        .type(response === 'success' ? 'text/plain' : 'application/xml')
        .send(response === 'success' ? response : notifyCrypto.encode(response));
    });
  }
  return {
    store,
    payments,
    recordReferral: (id?: string) => {
      if (id && store)
        store.db
          .prepare('UPDATE projects SET referrals=referrals+1 WHERE id=? AND active=1')
          .run(id);
    },
  };
}
