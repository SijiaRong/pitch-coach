import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const MAX_REPORT_BYTES = 1024 * 1024;
export const paymentKey = (secret: string, purpose: string) =>
  createHash('sha256').update(`pitchcoach-payment-${purpose}:${secret}`).digest();

export function seal(data: Uint8Array, key: Buffer, context: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([nonce, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
}
export function unseal(data: Uint8Array, key: Buffer, context: string): Buffer {
  const value = Buffer.from(data);
  if (value.length < 28) throw new Error('Invalid encrypted payment data');
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(value.subarray(-16));
  return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]);
}
export function packReport(report: unknown, key: Buffer, id: string): Buffer {
  const json = Buffer.from(JSON.stringify(report));
  if (json.length > MAX_REPORT_BYTES) throw new Error('Report exceeds storage size limit');
  return seal(deflateRawSync(json, { level: 6 }), key, `v2:${id}`);
}
export function unpackReport(data: Uint8Array, key: Buffer, id: string): unknown {
  const compressed = unseal(data, key, `v2:${id}`);
  return JSON.parse(inflateRawSync(compressed, { maxOutputLength: MAX_REPORT_BYTES }).toString());
}
