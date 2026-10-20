import { PublicError } from './errors';
import type { Config } from './config';

export class WechatApi {
  private cached?: { value: string; until: number };
  private fetching?: Promise<string>;
  constructor(
    private config: Config,
    private fetcher: typeof fetch = fetch,
  ) {}
  async token(): Promise<string> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.value;
    if (!this.config.WECHAT_APP_ID || !this.config.WECHAT_APP_SECRET)
      throw new PublicError(503, 'WECHAT_NOT_CONFIGURED', '小程序码服务尚未配置');
    if (!this.fetching)
      this.fetching = this.fetchToken().finally(() => {
        this.fetching = undefined;
      });
    return this.fetching;
  }
  private async fetchToken() {
    const data = await this.post('https://api.weixin.qq.com/cgi-bin/stable_token', {
      grant_type: 'client_credential',
      appid: this.config.WECHAT_APP_ID,
      secret: this.config.WECHAT_APP_SECRET,
      force_refresh: false,
    });
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number')
      throw new PublicError(502, 'WECHAT_UNAVAILABLE', '微信服务暂不可用');
    this.cached = {
      value: data.access_token,
      until: Date.now() + Math.max(0, data.expires_in - 120) * 1000,
    };
    return data.access_token;
  }
  async post(url: string, body: unknown): Promise<Record<string, any>> {
    try {
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (text.length > 128000) throw new Error();
      const data = JSON.parse(text);
      if (data.errcode && data.errcode !== 0) throw new Error();
      return data;
    } catch {
      throw new PublicError(502, 'WECHAT_UNAVAILABLE', '微信服务暂不可用，请稍后重试');
    }
  }
  async miniCode(id: string, page = 'pages/project/index') {
    const token = await this.token();
    try {
      const response = await this.fetcher(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene: id,
            page,
            env_version: this.config.MINIPROGRAM_ENV,
            check_path: this.config.MINIPROGRAM_ENV === 'release',
            width: 430,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      if (
        !response.ok ||
        bytes.length > 1024 * 1024 ||
        bytes.length < 12 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      )
        throw new Error();
      return bytes;
    } catch {
      throw new PublicError(
        502,
        'SHARE_CODE_UNAVAILABLE',
        '小程序码生成失败，请确认页面已发布及小程序配置',
      );
    }
  }
}

export interface WechatIdentity {
  openid: string;
  sessionKey: string;
}
/**
 * Short-lived WeChat session keys, needed only to sign virtual payments.
 * Every entry shares one TTL, so Map insertion order is also expiry order: expired entries are
 * swept from the front, and at capacity the oldest login is evicted instead of rejecting new
 * logins. An evicted user is simply asked to log in again before paying.
 */
export class IdentityVault {
  private entries = new Map<string, WechatIdentity & { until: number }>();
  constructor(
    private capacity = 50000,
    private ttlMs = 7000000,
  ) {}
  put(owner: string, identity: WechatIdentity) {
    const now = Date.now();
    for (const [key, value] of this.entries) {
      if (value.until > now) break;
      this.entries.delete(key);
    }
    // Re-insert so a repeat login moves to the back of the expiry order.
    this.entries.delete(owner);
    while (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(owner, { ...identity, until: now + this.ttlMs });
  }
  get(owner: string) {
    const value = this.entries.get(owner);
    if (!value || value.until <= Date.now())
      throw new PublicError(401, 'PAYMENT_LOGIN_REQUIRED', '请重新登录微信后再付款');
    return { openid: value.openid, sessionKey: value.sessionKey };
  }
  get size() {
    return this.entries.size;
  }
  clear() {
    this.entries.clear();
  }
}
