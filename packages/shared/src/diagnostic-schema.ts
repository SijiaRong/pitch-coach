import { z } from 'zod';

export const RISK_TOPICS = [
  'demand',
  'market',
  'product',
  'technology',
  'growth',
  'economics',
  'cash',
  'team',
  'compliance',
  'data',
  'dependency',
] as const;
export type RiskTopic = (typeof RISK_TOPICS)[number];
export const RISK_TOPIC_LABELS: Record<RiskTopic, string> = {
  demand: '需求真实性',
  market: '市场切口',
  product: '产品交付',
  technology: '技术壁垒',
  growth: '付费留存',
  economics: '单位经济',
  cash: '现金跑道',
  team: '团队执行',
  compliance: '业务准入',
  data: '数据与授权',
  dependency: '关键依赖',
};

export const FAILURE_MECHANISMS = [
  'cash_exhaustion',
  'retention_collapse',
  'delivery_breakdown',
  'commoditization',
  'dependency_break',
  'execution_break',
  'demand_mismatch',
  'access_block',
] as const;
export type FailureMechanism = (typeof FAILURE_MECHANISMS)[number];
/** Public copy is curated, conditional and contains no BP excerpts or model-generated secrets. */
export const FAILURE_PUBLIC_COPY: Record<FailureMechanism, string> = {
  cash_exhaustion: '若验证前现金耗尽，项目可能先断粮。',
  retention_collapse: '若客户留不住，扩张可能加速失血。',
  delivery_breakdown: '若交付撑不住，订单可能变成负债。',
  commoditization: '若优势被复制，产品可能陷入价格战。',
  dependency_break: '若关键依赖断裂，业务可能被迫停摆。',
  execution_break: '若执行跟不上，计划可能耗死现金。',
  demand_mismatch: '若付费需求不成立，增长可能只是热闹。',
  access_block: '若准入与授权问题不解，商业化可能停摆。',
};

const flagFields = {
  topic: z.enum(RISK_TOPICS),
  title: z.string().trim().min(1).max(40),
  detail: z.string().trim().min(1).max(220),
  question: z.string().trim().min(1).max(160),
  remedy: z.string().trim().min(1).max(180),
};
export const redFlagSchema = z.object({
  ...flagFields,
  basis: z.literal('explicit_statement'),
  evidence: z.string().trim().min(4).max(240),
});
export const orangeFlagSchema = z.object({
  ...flagFields,
  evidence: z.string().trim().max(240),
  missing: z.string().trim().min(1).max(180),
});
export const assumptionSchema = z.object({
  topic: z.enum(RISK_TOPICS),
  statement: z.string().trim().min(1).max(160),
  basis: z.enum(['stated', 'inferred']),
  evidence: z.string().trim().max(240),
  whyCritical: z.string().trim().min(1).max(180),
  test: z.string().trim().min(1).max(180),
  passCriterion: z.string().trim().min(1).max(140),
});
export const failureModeSchema = z.object({
  mechanism: z.enum(FAILURE_MECHANISMS),
  basedOn: z.array(z.enum(RISK_TOPICS)).min(1).max(3),
  condition: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^(若|如果)/, '失败情景必须明确写出若或如果的触发条件'),
  chain: z.string().trim().min(1).max(220),
  earlySignal: z.string().trim().min(1).max(140),
  prevention: z.string().trim().min(1).max(180),
});
export const diagnosticsSchema = z.object({
  redFlags: z.array(redFlagSchema).max(3),
  orangeFlags: z.array(orangeFlagSchema).max(4),
  failureModes: z.array(failureModeSchema).max(2),
  assumptions: z.array(assumptionSchema).max(4),
});
export type ReviewDiagnostics = z.infer<typeof diagnosticsSchema>;
export type RedFlag = z.infer<typeof redFlagSchema>;
export type OrangeFlag = z.infer<typeof orangeFlagSchema>;
export type KeyAssumption = z.infer<typeof assumptionSchema>;
export type FailureMode = z.infer<typeof failureModeSchema>;
export type Attributed<T> = T & { investorIds: string[] };
export interface ReportDiagnostics {
  redFlags: Attributed<RedFlag>[];
  orangeFlags: Attributed<OrangeFlag>[];
  failureModes: Attributed<FailureMode>[];
  assumptions: Attributed<KeyAssumption>[];
  reviewedInvestors: number;
  gate: 'blocked' | 'clarify' | 'validate' | 'clear';
}

export const emptyDiagnostics = (): ReviewDiagnostics => ({
  redFlags: [],
  orangeFlags: [],
  failureModes: [],
  assumptions: [],
});
