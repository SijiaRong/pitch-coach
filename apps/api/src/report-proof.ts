import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EvaluationReport } from '@pitchcoach/shared';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function signature(report: EvaluationReport, owner: string, expiry: string, secret: string) {
  const { publicationProof, ...content } = report;
  return createHmac('sha256', secret)
    .update(`publish-v1\n${owner}\n${expiry}\n${canonical(content)}`)
    .digest('base64url');
}
export function attestReport(report: EvaluationReport, owner: string, secret: string) {
  const expiry = String(Date.now() + 30 * 86400000);
  return `${expiry}.${signature(report, owner, expiry, secret)}`;
}
export function verifyReportProof(
  report: EvaluationReport,
  owner: string,
  secret: string,
): boolean {
  const [expiry, proof, extra] = report.publicationProof?.split('.') || [];
  if (
    extra ||
    !/^\d{13}$/.test(expiry || '') ||
    Number(expiry) <= Date.now() ||
    !/^[\w-]{43}$/.test(proof || '')
  )
    return false;
  const expected = signature(report, owner, expiry, secret);
  return timingSafeEqual(Buffer.from(proof), Buffer.from(expected));
}
