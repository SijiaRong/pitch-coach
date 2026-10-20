import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PublicError } from './errors';

const denied = () => new PublicError(403, 'INVALID_NOTIFICATION', '通知验证失败');
const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: false,
  parseTagValue: false,
});
export function parseWechatXml(value: string): Record<string, any> {
  if (
    value.length > 65536 ||
    /<!DOCTYPE|<!ENTITY/i.test(value) ||
    XMLValidator.validate(value) !== true
  )
    throw denied();
  const result = parser.parse(value)?.xml;
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw denied();
  return result;
}
export class WechatNotifyCrypto {
  private key: Buffer;
  constructor(
    private token: string,
    encodingKey: string,
    private appid: string,
  ) {
    this.key = Buffer.from(encodingKey + '=', 'base64');
    if (!token || this.key.length !== 32 || !appid)
      throw new Error('Incomplete WeChat notify configuration');
  }
  signature(timestamp: string, nonce: string, encrypted?: string) {
    return createHash('sha1')
      .update([this.token, timestamp, nonce, ...(encrypted ? [encrypted] : [])].sort().join(''))
      .digest('hex');
  }
  verify(signature: string, timestamp: string, nonce: string, encrypted?: string) {
    const expected = this.signature(timestamp, nonce, encrypted);
    if (
      !/^[a-f\d]{40}$/i.test(signature) ||
      !timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected))
    )
      throw denied();
  }
  decrypt(encrypted: string) {
    try {
      const decipher = createDecipheriv('aes-256-cbc', this.key, this.key.subarray(0, 16));
      decipher.setAutoPadding(false);
      const padded = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]);
      const padding = padded.at(-1)!;
      if (
        padding < 1 ||
        padding > 32 ||
        !padded.subarray(-padding).every((byte) => byte === padding)
      )
        throw denied();
      const plain = padded.subarray(0, -padding);
      if (plain.length < 20) throw denied();
      const length = plain.readUInt32BE(16);
      if (length > plain.length - 20 || plain.subarray(20 + length).toString('utf8') !== this.appid)
        throw denied();
      return plain.subarray(20, 20 + length).toString('utf8');
    } catch {
      throw denied();
    }
  }
  encode(value: string) {
    const content = Buffer.from(value),
      length = Buffer.alloc(4);
    length.writeUInt32BE(content.length);
    const body = Buffer.concat([randomBytes(16), length, content, Buffer.from(this.appid)]);
    const padding = 32 - (body.length % 32);
    const cipher = createCipheriv('aes-256-cbc', this.key, this.key.subarray(0, 16));
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.concat([body, Buffer.alloc(padding, padding)])),
      cipher.final(),
    ]).toString('base64');
    const timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = randomBytes(8).toString('hex');
    return `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt><MsgSignature><![CDATA[${this.signature(timestamp, nonce, encrypted)}]]></MsgSignature><TimeStamp>${timestamp}</TimeStamp><Nonce><![CDATA[${nonce}]]></Nonce></xml>`;
  }
}
