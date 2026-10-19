import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { getPanel, submissionSchema } from '@pitchcoach/shared';
import type { Config } from './config';
import { createSession, requireOwner } from './auth';
import { PublicError } from './errors';
import { extractDocument, MAX_FILE_BYTES } from './extract';
import { EvaluationJobs } from './jobs';
import { createReviewer } from './provider';
import { Billing } from './billing';
import { REVIEW_PRICE_FEN } from '@pitchcoach/shared';
import type { Reviewer } from './provider';

export async function createApp(
  config: Config,
  options: { reviewer?: Reviewer; logger?: boolean; billing?: Billing } = {},
) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 400000,
    logController: new LogController({ disableRequestLogging: true }),
    // Enable only behind a local proxy that overwrites client forwarding headers.
    trustProxy: config.TRUST_PROXY_LOOPBACK === 'true' ? '127.0.0.1' : false,
  });
  await app.register(helmet);
  await app.register(cors, { origin: config.origins, methods: ['GET', 'POST', 'DELETE'] });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 1, parts: 2 },
  });
  await app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new PublicError(429, 'RATE_LIMIT', '请求太频繁，请稍后重试'),
  });
  const billing = options.billing ?? Billing.create(config);
  const jobs = new EvaluationJobs(
    config,
    options.reviewer ?? createReviewer(config),
    billing?.store,
  );
  const timer = setInterval(() => {
    jobs.sweep();
    billing?.store.sweep();
  }, 60000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    jobs.close();
    billing?.close();
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message || '请检查提交资料',
        },
      });
    if (error instanceof PublicError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_ERR_CTP_BODY_TOO_LARGE')
      return reply
        .code(413)
        .send({ error: { code: 'FILE_TOO_LARGE', message: '资料超过大小限制，请使用精简版 BP' } });
    if (code?.startsWith('FST_'))
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_REQUEST', message: '请求格式不正确，请重试' } });
    // Avoid logging error objects, request bodies, headers, or vendor responses.
    app.log.error({ event: 'request_failed' }, 'Request failed');
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: '服务暂时遇到问题，请稍后重试' } });
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/api/config', async (request) => {
    const query = z.object({
      industry: z.string().optional(),
      round: z.string().optional(),
      preferences: z.string().optional(),
    }).parse(request.query);
    let liveAvailable = config.liveAvailable;
    if (query.industry !== undefined || query.round !== undefined || query.preferences !== undefined) {
      const panel = submissionSchema.pick({ industry: true, round: true, preferences: true }).parse({
        ...query,
        preferences: query.preferences?.split(','),
      });
      liveAvailable = Boolean(options.reviewer) || getPanel(panel.industry, panel.round, panel.preferences)
        .every((investor) => Boolean(config.modelFor(investor.id).apiKey));
    }
    return {
      liveAvailable,
      requireWechat: Boolean(config.WECHAT_APP_ID),
      maxFileBytes: MAX_FILE_BYTES,
      paymentsEnabled: Boolean(billing),
      reviewPriceFen: REVIEW_PRICE_FEN,
      supportContact: config.PAY_SUPPORT_CONTACT,
    };
  });
  app.post(
    '/api/session',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request) => {
      const body = z.object({ code: z.string().max(256).optional() }).parse(request.body);
      return createSession(body.code, config, fetch, (owner, openid) =>
        billing?.register(owner, openid),
      );
    },
  );
  app.post(
    '/api/documents/extract',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request) => {
      requireOwner(request, config);
      const file = await request.file();
      if (!file) throw new PublicError(400, 'FILE_REQUIRED', '请先选择 BP 文件');
      const buffer = await file.toBuffer();
      const consent = file.fields.consent;
      if (
        !consent ||
        Array.isArray(consent) ||
        consent.type !== 'field' ||
        consent.value !== 'true'
      )
        throw new PublicError(400, 'CONSENT_REQUIRED', '请先同意本次资料处理');
      if (file.file.truncated) throw new PublicError(413, 'FILE_TOO_LARGE', '文件不能超过 10 MB');
      return extractDocument(buffer, file.filename);
    },
  );
  app.post(
    '/api/evaluations',
    { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const owner = requireOwner(request, config);
      const submission = submissionSchema.parse(request.body);
      if (
        !options.reviewer &&
        !getPanel(submission.industry, submission.round, submission.preferences).every(
          (investor) => config.modelFor(investor.id).apiKey,
        )
      )
        throw new PublicError(
          503,
          'AI_NOT_CONFIGURED',
          '本场部分 AI 教练尚未配置，可以调整偏好或先体验示例报告',
        );
      const requestKey = z
        .string()
        .min(12)
        .max(80)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional()
        .parse(request.headers['idempotency-key']);
      return reply.code(202).send(jobs.create(owner, submission, requestKey));
    },
  );
  app.get('/api/evaluations/:id', async (request) => {
    const owner = requireOwner(request, config);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return jobs.get(id, owner);
  });
  app.delete('/api/evaluations/:id', async (request, reply) => {
    const owner = requireOwner(request, config);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    jobs.remove(id, owner);
    return reply.code(204).send();
  });
  const requireBilling = () => {
    if (!billing)
      throw new PublicError(503, 'PAYMENT_NOT_CONFIGURED', '微信支付尚未开放，请先查看免费示例');
    return billing;
  };
  app.get('/api/billing/status', async (request) => {
    const owner = requireOwner(request, config);
    return requireBilling().status(owner);
  });
  app.post(
    '/api/billing/orders',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request) => {
      const owner = requireOwner(request, config);
      z.object({})
        .strict()
        .parse(request.body ?? {});
      if (!config.liveAvailable && !options.reviewer)
        throw new PublicError(503, 'AI_NOT_CONFIGURED', '评审服务尚未就绪，暂不接受支付');
      return requireBilling().createOrder(owner);
    },
  );
  app.get('/api/billing/orders/:id', async (request) => {
    const owner = requireOwner(request, config);
    const { id } = z.object({ id: z.string().regex(/^PC[a-f0-9]{30}$/) }).parse(request.params);
    const service = requireBilling();
    await service.refresh(id, owner);
    return {
      order: { id, status: service.store.order(id, owner).status },
      billing: service.status(owner),
    };
  });
  await app.register(async (callback) => {
    callback.removeContentTypeParser('application/json');
    callback.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    callback.post(
      '/api/payments/wechat/notify',
      {
        bodyLimit: 128000,
        config: { rateLimit: false },
      },
      async (request, reply) => {
        try {
          requireBilling().notification(request.body as Buffer, request.headers);
          return reply.code(204).send();
        } catch (error) {
          return reply
            .code(error instanceof PublicError && error.statusCode === 400 ? 400 : 503)
            .send({ code: 'FAIL', message: '通知尚未确认' });
        }
      },
    );
  });
  return app;
}
