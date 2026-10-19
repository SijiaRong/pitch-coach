import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  INDUSTRIES,
  INVESTORS,
  PREFERENCES,
  FUNDING_ROUNDS,
  PANEL_SIZE,
  getSpecialist,
} from '@pitchcoach/shared';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  AI_BASE_URL: z.url().default('https://api.deepseek.com'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('deepseek-flash'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  AI_JSON_MODE: z.enum(['true', 'false']).default('true'),
  SESSION_SECRET: z.string().default(''),
  WECHAT_APP_ID: z.string().default(''),
  WECHAT_APP_SECRET: z.string().default(''),
  OWNER_ID_SECRET: z.string().default(''),
  PROJECT_SHARING_ENABLED: z.enum(['true', 'false']).default('false'),
  PROJECT_DATABASE_PATH: z.string().default(''),
  PROJECT_DATA_KEY: z.string().default(''),
  PUBLIC_WEB_URL: z.string().default(''),
  MINIPROGRAM_ENV: z.enum(['release', 'trial', 'develop']).default('release'),
  VIRTUALPAY_ENABLED: z.enum(['true', 'false']).default('false'),
  VIRTUALPAY_OFFER_ID: z.string().default(''),
  VIRTUALPAY_APP_KEY: z.string().default(''),
  VIRTUALPAY_PRODUCTS: z.string().default('{}'),
  WECHAT_MESSAGE_TOKEN: z.string().default(''),
  WECHAT_ENCODING_AES_KEY: z.string().default(''),
  PROJECT_SETTLEMENT_READY: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  MAX_ACTIVE_EVALUATIONS: z.coerce.number().int().min(1).max(20).default(2),
  DAILY_EVALUATIONS_PER_USER: z.coerce.number().int().min(1).max(100).default(5),
});

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode: boolean;
}
export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = envSchema.parse(env);
  const sharingEnabled = value.PROJECT_SHARING_ENABLED === 'true';
  const paymentEnabled = value.VIRTUALPAY_ENABLED === 'true';
  const paymentProducts = z
    .record(
      z.string().regex(/^(unlock|tip):[1-9]\d{0,6}$/),
      z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
    )
    .parse(JSON.parse(value.VIRTUALPAY_PRODUCTS));
  if (
    sharingEnabled &&
    (!value.PROJECT_DATABASE_PATH ||
      !/^[a-fA-F0-9]{64}$/.test(value.PROJECT_DATA_KEY) ||
      value.OWNER_ID_SECRET.length < 32 ||
      value.SESSION_SECRET.length < 32)
  )
    throw new Error(
      '公开项目需要持久数据库、64位十六进制 PROJECT_DATA_KEY、32位以上 OWNER_ID_SECRET 和 SESSION_SECRET',
    );
  if (value.PUBLIC_WEB_URL) {
    const publicUrl = new URL(value.PUBLIC_WEB_URL);
    if (
      !['https:', ...(value.NODE_ENV === 'production' ? [] : ['http:'])].includes(
        publicUrl.protocol,
      ) ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.search ||
      publicUrl.hash
    )
      throw new Error('PUBLIC_WEB_URL 必须是无凭据、查询或片段的网页基础地址，生产环境使用 HTTPS');
  }
  if (
    paymentEnabled &&
    (!sharingEnabled ||
      !value.WECHAT_APP_ID ||
      !value.WECHAT_APP_SECRET ||
      !value.VIRTUALPAY_OFFER_ID ||
      !value.VIRTUALPAY_APP_KEY ||
      !value.WECHAT_MESSAGE_TOKEN ||
      !/^[A-Za-z0-9+/]{43}$/.test(value.WECHAT_ENCODING_AES_KEY) ||
      !Object.keys(paymentProducts).length ||
      value.PROJECT_SETTLEMENT_READY !== 'true')
  )
    throw new Error(
      '真实收款需要开启共享、完整虚拟支付/消息推送配置、已发布价位及已确定的项目方结算方案',
    );
  if (value.NODE_ENV === 'production') {
    if (value.SESSION_SECRET.length < 32)
      throw new Error('生产环境需要至少 32 字符的 SESSION_SECRET');
    if (!value.WECHAT_APP_ID || !value.WECHAT_APP_SECRET)
      throw new Error('生产环境需要 WECHAT_APP_ID 和 WECHAT_APP_SECRET');
    if (value.AI_API_KEY && !value.AI_BASE_URL.startsWith('https://'))
      throw new Error('生产环境 AI_BASE_URL 必须使用 HTTPS');
  }
  const modelFor = (investorId: string): ModelConfig => {
    const investor = INVESTORS[investorId];
    const key = (id: string) => id.replaceAll('-', '_').toUpperCase();
    const prefixes = [
      `AI_${key(investorId)}`,
      ...(investor?.preference ? [`AI_PREFERENCE_${key(investor.preference)}`] : []),
      ...(investor?.round ? [`AI_ROUND_${key(investor.round)}`] : []),
      ...(investor?.industry ? [`AI_INDUSTRY_${key(investor.industry)}`] : []),
      ...(investor?.legacyModelId ? [`AI_${key(investor.legacyModelId)}`] : []),
    ];
    const read = (field: string, fallback: string) =>
      prefixes.map((prefix) => env[`${prefix}_${field}`]).find(Boolean) || fallback;
    return {
      baseUrl: read('BASE_URL', value.AI_BASE_URL),
      apiKey: read('API_KEY', value.AI_API_KEY),
      model: read('MODEL', value.AI_MODEL),
      jsonMode: value.AI_JSON_MODE === 'true',
    };
  };
  if (value.NODE_ENV === 'production') {
    for (const investor of Object.values(INVESTORS)) {
      const model = modelFor(investor.id);
      if (model.apiKey && !model.baseUrl.startsWith('https://'))
        throw new Error('生产环境 AI_BASE_URL 与角色覆盖地址必须使用 HTTPS');
    }
  }
  const liveAvailable = INDUSTRIES.some((industry) =>
    FUNDING_ROUNDS.some(
      (round) =>
        PREFERENCES.filter(
          (preference) => modelFor(getSpecialist(industry.id, round.id, preference.id).id).apiKey,
        ).length >= PANEL_SIZE,
    ),
  );
  return {
    ...value,
    sharingEnabled,
    paymentEnabled,
    paymentProducts,
    SESSION_SECRET: value.SESSION_SECRET || randomBytes(32).toString('hex'),
    origins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    modelFor,
    liveAvailable,
  };
}
