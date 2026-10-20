import { z } from 'zod';
import type { EvaluationReport } from './schema';

export const CLOUD_CONSENT_VERSION = '2026-10-20-cloud-v1';
export const MAX_CLOUD_REPORTS = 100;
export const accountSettingsSchema = z
  .object({
    displayName: z.string().trim().max(20).optional(),
    role: z.enum(['entrepreneur', 'investor', 'supporter']).optional(),
    cloudSyncEnabled: z.boolean().optional(),
    cloudStorageConsent: z.boolean().default(false),
  })
  .strict();
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export interface AccountInfo {
  id: string;
  displayName: string;
  role: 'entrepreneur' | 'investor' | 'supporter';
  wechatBound: true;
  cloudSyncEnabled: boolean;
  reportCount: number;
  reportLimit: number;
  createdAt: string;
}
export type CloudReportSummary = Pick<
  EvaluationReport,
  'id' | 'projectName' | 'industry' | 'round' | 'createdAt' | 'score' | 'coverage' | 'verdict'
> & { decisionText: string; diagnosticCounts: string };
