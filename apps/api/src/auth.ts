import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Config } from './config';
import { PublicError } from './errors';
import type {WechatIdentity} from './wechat-api';

const hmac = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export function issueToken(subject: string, config: Config) {
  const payload = Buffer.from(
    JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 7200 }),
  ).toString('base64url');
  return `${payload}.${hmac(payload, config.SESSION_SECRET)}`;
}

export function requireOwner(request: FastifyRequest, config: Config): string {
  const token = request.headers.authorization?.replace(/^Bearer /, '') || '';
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || token.length > 1024)
    throw new PublicError(401, 'UNAUTHORIZED', '登录已过期，请重新打开后重试');
  const expected = hmac(payload, config.SESSION_SECRET);
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new PublicError(401, 'UNAUTHORIZED', '登录已过期，请重试');
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      typeof value.sub !== 'string' ||
      !Number.isFinite(value.exp) ||
      value.exp <= Date.now() / 1000
    )
      throw new Error();
    return value.sub;
  } catch {
    throw new PublicError(401, 'UNAUTHORIZED', '登录已过期，请重试');
  }
}

export async function createSession(
  code: string | undefined,
  config: Config,
  fetcher: typeof fetch = fetch,
  onAuthenticated?: (owner: string, openid: string) => void,
  onIdentity?: (owner:string, identity:WechatIdentity)=>void,
) {
  if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
    if (config.NODE_ENV === 'production')
      throw new PublicError(503, 'LOGIN_NOT_CONFIGURED', '微信登录尚未配置');
    return { token: issueToken(`dev:${randomUUID()}`, config), expiresIn: 7200, development: true };
  }
  if (!code) throw new PublicError(400, 'CODE_REQUIRED', '请从微信小程序内发起评估');
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.search = new URLSearchParams({
    appid: config.WECHAT_APP_ID,
    secret: config.WECHAT_APP_SECRET,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString();
  let data: { openid?: string; session_key?:string; errcode?: number };
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    data = (await response.json()) as typeof data;
  } catch {
    throw new PublicError(502, 'WECHAT_UNAVAILABLE', '微信登录服务暂不可用，请稍后重试');
  }
  if (data.errcode || !data.openid)
    throw new PublicError(401, 'LOGIN_FAILED', '微信登录失败，请重新打开小程序后重试');
  const owner = `wx:${hmac(data.openid, config.OWNER_ID_SECRET || config.SESSION_SECRET)}`;
  onAuthenticated?.(owner, data.openid);
  if(data.session_key)onIdentity?.(owner,{openid:data.openid,sessionKey:data.session_key});
  return {
    token: issueToken(owner, config),
    expiresIn: 7200,
    development: false,
  };
}
