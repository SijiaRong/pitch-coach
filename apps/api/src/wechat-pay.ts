import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { REVIEW_PRICE_FEN } from '@pitchcoach/shared';
import type { WechatPaymentParams } from '@pitchcoach/shared';
import type { Config } from './config';
import { PublicError } from './errors';

export const transactionSchema = z.object({
  appid: z.string(),
  mchid: z.string(),
  out_trade_no: z.string(),
  transaction_id: z.string().min(1),
  trade_type: z.literal('JSAPI'),
  trade_state: z.literal('SUCCESS'),
  payer: z.object({ openid: z.string() }),
  amount: z.object({ total: z.literal(REVIEW_PRICE_FEN), currency: z.literal('CNY') }),
});
export type PaidTransaction = z.infer<typeof transactionSchema>;
export interface PaymentGateway {
  prepay(order: string, openid: string, expiresAt: number): Promise<string>;
  params(prepay: string): WechatPaymentParams;
  query(order: string): Promise<PaidTransaction | undefined>;
  notification(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): PaidTransaction;
}

export class WechatPay implements PaymentGateway {
  private privateKey;
  private publicKey;
  constructor(
    private config: Config,
    private fetcher: typeof fetch = fetch,
  ) {
    this.privateKey = createPrivateKey(readFileSync(config.WECHAT_PAY_PRIVATE_KEY_PATH));
    this.publicKey = createPublicKey(readFileSync(config.WECHAT_PAY_PUBLIC_KEY_PATH));
    if (this.privateKey.asymmetricKeyType !== 'rsa' || this.publicKey.asymmetricKeyType !== 'rsa')
      throw new Error('微信支付需要 RSA 密钥');
  }
  private signature(message: string) {
    return sign('RSA-SHA256', Buffer.from(message), this.privateKey).toString('base64');
  }
  private verify(raw: string, headers: Record<string, string | string[] | undefined>) {
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const signature = headers['wechatpay-signature'];
    const serial = headers['wechatpay-serial'];
    if (
      typeof timestamp !== 'string' ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      typeof nonce !== 'string' ||
      nonce.length > 128 ||
      typeof signature !== 'string' ||
      signature.length > 1024 ||
      serial !== this.config.WECHAT_PAY_PUBLIC_KEY_ID ||
      !verify(
        'RSA-SHA256',
        Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
        this.publicKey,
        Buffer.from(signature, 'base64'),
      )
    )
      throw new PublicError(400, 'PAYMENT_SIGNATURE_INVALID', '支付通知验签失败');
  }
  private async request(method: 'GET' | 'POST', path: string, data?: unknown): Promise<unknown> {
    const body = data ? JSON.stringify(data) : '';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const signature = this.signature(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
    let response: Response;
    try {
      response = await this.fetcher(`https://api.mch.weixin.qq.com${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Wechatpay-Serial': this.config.WECHAT_PAY_PUBLIC_KEY_ID,
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.config.WECHAT_PAY_SERIAL_NO}",signature="${signature}"`,
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new PublicError(
        502,
        'PAYMENT_UNAVAILABLE',
        '微信支付连接暂不可用，请稍后查询订单，勿重复付款',
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PublicError(
        502,
        'PAYMENT_UNAVAILABLE',
        '微信支付暂不可用，请稍后查询订单，勿重复付款',
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new PublicError(502, 'PAYMENT_INVALID_RESPONSE', '微信支付返回异常');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 128000) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
      const raw = Buffer.concat(chunks).toString();
      this.verify(raw, Object.fromEntries(response.headers.entries()));
      return JSON.parse(raw);
    } catch {
      throw new PublicError(
        502,
        'PAYMENT_INVALID_RESPONSE',
        '微信支付应答未通过校验，请稍后查询订单',
      );
    }
  }
  async prepay(order: string, openid: string, expiresAt: number) {
    const data = await this.request('POST', '/v3/pay/transactions/jsapi', {
      appid: this.config.WECHAT_APP_ID,
      mchid: this.config.WECHAT_PAY_MCH_ID,
      description: 'AI投了么-一次AI项目评审',
      out_trade_no: order,
      time_expire: new Date(expiresAt).toISOString(),
      notify_url: this.config.WECHAT_PAY_NOTIFY_URL,
      amount: { total: REVIEW_PRICE_FEN, currency: 'CNY' },
      payer: { openid },
    });
    return z.object({ prepay_id: z.string().min(1).max(128) }).parse(data).prepay_id;
  }
  params(prepay: string): WechatPaymentParams {
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepay}`;
    return {
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign: this.signature(`${this.config.WECHAT_APP_ID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`),
    };
  }
  async query(order: string): Promise<PaidTransaction | undefined> {
    const data = await this.request(
      'GET',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order)}?mchid=${encodeURIComponent(this.config.WECHAT_PAY_MCH_ID)}`,
    );
    const state = z.object({ trade_state: z.string() }).parse(data);
    if (state.trade_state === 'SUCCESS') return transactionSchema.parse(data);
    return undefined;
  }
  notification(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    this.verify(raw.toString(), headers);
    try {
      const event = z
        .object({
          event_type: z.literal('TRANSACTION.SUCCESS'),
          resource_type: z.literal('encrypt-resource'),
          resource: z.object({
            algorithm: z.literal('AEAD_AES_256_GCM'),
            original_type: z.literal('transaction'),
            ciphertext: z.string(),
            nonce: z.string(),
            associated_data: z.string().optional(),
          }),
        })
        .parse(JSON.parse(raw.toString()));
      const { resource } = event;
      const cipher = Buffer.from(resource.ciphertext, 'base64');
      if (cipher.length < 17) throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.config.WECHAT_PAY_API_V3_KEY),
        Buffer.from(resource.nonce),
      );
      decipher.setAuthTag(cipher.subarray(-16));
      decipher.setAAD(Buffer.from(resource.associated_data || ''));
      const plaintext = Buffer.concat([decipher.update(cipher.subarray(0, -16)), decipher.final()]);
      return transactionSchema.parse(JSON.parse(plaintext.toString()));
    } catch {
      throw new PublicError(400, 'PAYMENT_NOTIFICATION_INVALID', '支付通知校验失败');
    }
  }
}
