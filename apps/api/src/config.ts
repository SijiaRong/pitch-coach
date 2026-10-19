import { randomBytes } from 'node:crypto';
import { z } from 'zod';

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
  if (value.NODE_ENV === 'production') {
    if (value.SESSION_SECRET.length < 32)
      throw new Error('生产环境需要至少 32 字符的 SESSION_SECRET');
    if (!value.WECHAT_APP_ID || !value.WECHAT_APP_SECRET)
      throw new Error('生产环境需要 WECHAT_APP_ID 和 WECHAT_APP_SECRET');
    if (value.AI_API_KEY && !value.AI_BASE_URL.startsWith('https://'))
      throw new Error('生产环境 AI_BASE_URL 必须使用 HTTPS');
  }
  return {
    ...value,
    SESSION_SECRET: value.SESSION_SECRET || randomBytes(32).toString('hex'),
    origins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    modelFor(investorId: string): ModelConfig {
      const prefix = `AI_${investorId.replaceAll('-', '_').toUpperCase()}`;
      return {
        baseUrl: env[`${prefix}_BASE_URL`] || value.AI_BASE_URL,
        apiKey: env[`${prefix}_API_KEY`] || value.AI_API_KEY,
        model: env[`${prefix}_MODEL`] || value.AI_MODEL,
        jsonMode: value.AI_JSON_MODE === 'true',
      };
    },
  };
}
