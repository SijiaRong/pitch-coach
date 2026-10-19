import { z } from 'zod';
import {
  DEFAULT_PREFERENCES,
  DIMENSION_IDS,
  INDUSTRY_IDS,
  PANEL_SIZE,
  PREFERENCE_IDS,
  ROUND_IDS,
  STAGES,
} from './catalog';
import type { PreferenceId } from './catalog';
import { diagnosticsSchema } from './diagnostic-schema';
import type { ReportDiagnostics } from './diagnostic-schema';

export const panelPreferencesSchema = z
  .array(z.enum(PREFERENCE_IDS))
  .length(PANEL_SIZE, '请选择三种投资偏好，组成三人投委会')
  .refine((items) => new Set(items).size === PANEL_SIZE, '投资偏好不能重复')
  .default(() => [...DEFAULT_PREFERENCES]);

export const submissionSchema = z.object({
  projectName: z.string().trim().min(1, '请填写项目名称').max(32),
  industry: z.enum(INDUSTRY_IDS),
  round: z.enum(ROUND_IDS).default('angel'),
  preferences: panelPreferencesSchema,
  stage: z.enum(STAGES),
  description: z.string().trim().min(30, '请至少用 30 个字说明项目').max(3000),
  bpText: z.string().trim().max(50000).default(''),
  tone: z.enum(['sharp', 'balanced']).default('sharp'),
  referralProjectId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{22}$/)
    .optional(),
  consent: z.literal(true, { error: '请先同意将资料发送给 AI 服务进行本次评估' }),
});
export type Submission = z.infer<typeof submissionSchema>;

export const dimensionReviewSchema = z.object({
  id: z.enum(DIMENSION_IDS),
  score: z.number().int().min(0).max(100).nullable(),
  evidence: z.string().trim().max(240),
  reason: z.string().trim().min(1).max(300),
  action: z.string().trim().min(1).max(220),
});

export const reviewContentSchema = z.object({
  vote: z.enum(['invest', 'watch', 'pass', 'insufficient']),
  thesis: z.string().trim().min(1).max(240),
  oneLiner: z.string().trim().min(1).max(64),
  dimensions: z
    .array(dimensionReviewSchema)
    .length(8)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === 8,
      '评分必须包含八个不同维度',
    ),
  questions: z.array(z.string().trim().min(1).max(180)).min(2).max(4),
  risks: z.array(z.string().trim().min(1).max(180)).min(1).max(4),
  diagnostics: diagnosticsSchema,
});
export type ReviewContent = z.infer<typeof reviewContentSchema>;
export type DimensionReview = z.infer<typeof dimensionReviewSchema>;
export interface InvestorReview extends ReviewContent {
  investorId: string;
  model: string;
  score: number | null;
  coverage: number;
}

export interface EvaluationReport {
  id: string;
  version: 1;
  createdAt: string;
  mode: 'demo' | 'live';
  projectName: string;
  industry: Submission['industry'];
  round: Submission['round'];
  /** Optional only for reports saved before preferences were introduced. */
  preferences?: PreferenceId[];
  stage: string;
  tone: Submission['tone'];
  score: number | null;
  coverage: number;
  verdict: ReviewContent['vote'];
  headline: string;
  summary: string;
  /** Absent only on reports created before structured risk diagnosis. */
  diagnostics?: ReportDiagnostics;
  decisionReasons?: string[];
  dimensions: (DimensionReview & { name: string; weight: number })[];
  investors: InvestorReview[];
  missingInvestors: string[];
  actions: { dimension: string; task: string; priority: number }[];
  disclaimer: string;
  /** Server attestation permits the owner to publish after the transient job is deleted. */
  publicationProof?: string;
}

export interface JobStatus {
  id: string;
  status: 'running' | 'done' | 'failed';
  completedInvestors: number;
  totalInvestors: number;
  report?: EvaluationReport;
  error?: { code: string; message: string };
}

export interface ApiError {
  code: string;
  message: string;
}
