import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  accountSettingsSchema,
  CLOUD_CONSENT_VERSION,
  MAX_CLOUD_REPORTS,
  decisionLabel,
  publicDiagnosticSummary,
} from '@pitchcoach/shared';
import type {
  AccountInfo,
  AccountSettings,
  CloudReportSummary,
  EvaluationReport,
} from '@pitchcoach/shared';
import { requireOwner } from './auth';
import type { Config } from './config';
import { PublicError } from './errors';
import type { ProjectStore } from './project-store';
import { verifyReportProof } from './report-proof';

interface ProfileRow {
  owner: string;
  id: string;
  display_name: string;
  role: AccountInfo['role'];
  cloud_enabled: number;
  consent_version: string | null;
  consented_at: string | null;
  created_at: string;
}
export class CloudAccounts {
  constructor(private store: ProjectStore) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS account_profiles(owner TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'entrepreneur',cloud_enabled INTEGER NOT NULL DEFAULT 0,consent_version TEXT,consented_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_reports(owner TEXT NOT NULL REFERENCES account_profiles(owner),id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,saved_at TEXT NOT NULL,PRIMARY KEY(owner,id));`);
  }
  private profile(owner: string): ProfileRow {
    this.store.db
      .prepare('INSERT OR IGNORE INTO account_profiles(owner,id,created_at) VALUES(?,?,?)')
      .run(owner, randomBytes(12).toString('base64url'), new Date().toISOString());
    return this.store.db
      .prepare('SELECT * FROM account_profiles WHERE owner=?')
      .get(owner) as unknown as ProfileRow;
  }
  enabled(owner: string) {
    const row = this.store.db
      .prepare('SELECT cloud_enabled,consent_version FROM account_profiles WHERE owner=?')
      .get(owner) as { cloud_enabled: number; consent_version: string } | undefined;
    return Boolean(row?.cloud_enabled && row.consent_version === CLOUD_CONSENT_VERSION);
  }
  info(owner: string): AccountInfo {
    const row = this.profile(owner),
      count = this.store.db
        .prepare('SELECT COUNT(*) AS n FROM cloud_reports WHERE owner=?')
        .get(owner) as { n: number };
    return {
      id: row.id,
      displayName: row.display_name
        ? this.store.unseal<string>(row.display_name, `profile:${owner}`)
        : '',
      role: row.role,
      wechatBound: true,
      cloudSyncEnabled: this.enabled(owner),
      reportCount: count.n,
      reportLimit: MAX_CLOUD_REPORTS,
      createdAt: row.created_at,
    };
  }
  update(owner: string, input: AccountSettings) {
    const current = this.profile(owner),
      enabled = input.cloudSyncEnabled ?? this.enabled(owner);
    if (enabled && !this.enabled(owner) && !input.cloudStorageConsent)
      throw new PublicError(400, 'CLOUD_CONSENT_REQUIRED', '请确认将评估报告加密保存到云端');
    this.store.db
      .prepare(
        'UPDATE account_profiles SET display_name=?,role=?,cloud_enabled=?,consent_version=?,consented_at=? WHERE owner=?',
      )
      .run(
        input.displayName === undefined
          ? current.display_name
          : input.displayName
            ? this.store.seal(input.displayName, `profile:${owner}`)
            : '',
        input.role ?? current.role,
        Number(enabled),
        enabled ? CLOUD_CONSENT_VERSION : current.consent_version,
        enabled && input.cloudStorageConsent ? new Date().toISOString() : current.consented_at,
        owner,
      );
    return this.info(owner);
  }
  saveIfEnabled(owner: string, report: EvaluationReport): 'saved' | 'off' {
    if (!this.enabled(owner)) return 'off';
    this.save(owner, report);
    return 'saved';
  }
  save(owner: string, report: EvaluationReport) {
    if (!this.enabled(owner)) throw new PublicError(409, 'CLOUD_SYNC_DISABLED', '请先开启云端保存');
    const exists = this.store.db
      .prepare('SELECT id FROM cloud_reports WHERE owner=? AND id=?')
      .get(owner, report.id);
    if (!exists && this.info(owner).reportCount >= MAX_CLOUD_REPORTS)
      throw new PublicError(409, 'CLOUD_LIMIT', '云端已有 100 份报告，请先删除不需要的报告');
    const context = `cloud:${owner}:${report.id}`;
    this.store.db
      .prepare(
        'INSERT INTO cloud_reports(owner,id,content,created_at,saved_at) VALUES(?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET content=excluded.content,saved_at=excluded.saved_at',
      )
      .run(
        owner,
        report.id,
        this.store.seal(report, context),
        report.createdAt,
        new Date().toISOString(),
      );
  }
  list(owner: string): CloudReportSummary[] {
    return this.store.db
      .prepare(
        'SELECT id,content FROM cloud_reports WHERE owner=? ORDER BY created_at DESC LIMIT ?',
      )
      .all(owner, MAX_CLOUD_REPORTS)
      .map((value) => {
        const row = value as { id: string; content: string },
          report = this.store.unseal<EvaluationReport>(row.content, `cloud:${owner}:${row.id}`);
        return {
          id: report.id,
          projectName: report.projectName,
          industry: report.industry,
          round: report.round,
          createdAt: report.createdAt,
          score: report.score,
          coverage: report.coverage,
          verdict: report.verdict,
          decisionText: decisionLabel(report),
          diagnosticCounts: publicDiagnosticSummary(report).counts,
        };
      });
  }
  report(owner: string, id: string) {
    const row = this.store.db
      .prepare('SELECT content FROM cloud_reports WHERE owner=? AND id=?')
      .get(owner, id) as { content: string } | undefined;
    if (!row) throw new PublicError(404, 'CLOUD_REPORT_NOT_FOUND', '找不到这份云端报告');
    return this.store.unseal<EvaluationReport>(row.content, `cloud:${owner}:${id}`);
  }
  remove(owner: string, id: string) {
    this.store.db.prepare('DELETE FROM cloud_reports WHERE owner=? AND id=?').run(owner, id);
  }
}
export function registerCloudAccounts(app: FastifyInstance, config: Config, store?: ProjectStore) {
  const service = config.cloudStorageEnabled && store ? new CloudAccounts(store) : undefined;
  const requireService = () => {
    if (!service)
      throw new PublicError(503, 'CLOUD_NOT_CONFIGURED', '云端保存尚未配置，本机报告仍可使用');
    return service;
  };
  const ownerFor = (request: Parameters<typeof requireOwner>[0]) => {
    const owner = requireOwner(request, config);
    if (!owner.startsWith('wx:'))
      throw new PublicError(401, 'WECHAT_LOGIN_REQUIRED', '请在微信小程序中登录后使用云端保存');
    return owner;
  };
  app.get('/api/account/config', async () => ({
    cloudAvailable: Boolean(service),
    wechatLoginAvailable: Boolean(config.WECHAT_APP_ID && config.WECHAT_APP_SECRET),
  }));
  app.get('/api/me', async (request) => requireService().info(ownerFor(request)));
  app.post('/api/me', async (request) =>
    requireService().update(ownerFor(request), accountSettingsSchema.parse(request.body)),
  );
  app.get('/api/me/reports', async (request) => requireService().list(ownerFor(request)));
  app.get('/api/me/reports/:id', async (request) =>
    requireService().report(ownerFor(request), z.object({ id: z.uuid() }).parse(request.params).id),
  );
  app.post('/api/me/reports', async (request) => {
    const owner = ownerFor(request),
      report = z
        .object({
          report: z.custom<EvaluationReport>((value) =>
            Boolean(value && typeof value === 'object'),
          ),
        })
        .parse(request.body).report;
    if (
      report.mode !== 'live' ||
      !z.uuid().safeParse(report.id).success ||
      !verifyReportProof(report, owner, config.SESSION_SECRET)
    )
      throw new PublicError(
        403,
        'REPORT_PROOF_REQUIRED',
        '只能同步本人已核验的真实评估，旧报告请重新评估',
      );
    requireService().save(owner, report);
    return { saved: true };
  });
  app.delete('/api/me/reports/:id', async (request, reply) => {
    requireService().remove(ownerFor(request), z.object({ id: z.uuid() }).parse(request.params).id);
    return reply.code(204).send();
  });
  return service;
}
