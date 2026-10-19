import { VOTE_LABELS } from './catalog';
import { FAILURE_PUBLIC_COPY, RISK_TOPIC_LABELS } from './diagnostic-schema';
import type {
  Attributed,
  ReportDiagnostics,
  ReviewDiagnostics,
  RiskTopic,
} from './diagnostic-schema';
import type { EvaluationReport, InvestorReview } from './schema';

const normalize = (value: string) => value.replace(/\s+/g, '').normalize('NFKC');
export const matchesEvidence = (quote: string, source: string) =>
  normalize(quote).length >= 4 && normalize(source).includes(normalize(quote));

/** Missing material is an orange question; an untraceable accusation cannot become a blocker. */
export function verifyDiagnostics(value: ReviewDiagnostics, source: string): ReviewDiagnostics {
  const redFlags = value.redFlags.filter((flag) => matchesEvidence(flag.evidence, source));
  const orangeFlags = value.orangeFlags.map((flag) => {
    if (!flag.evidence || matchesEvidence(flag.evidence, source)) return flag;
    return {
      ...flag,
      evidence: '',
      title: `${RISK_TOPIC_LABELS[flag.topic]}待澄清`,
      detail: '评审引用未能匹配资料原文，需要补充材料后再判断。',
      missing: `${RISK_TOPIC_LABELS[flag.topic]}的可核对证据`,
    };
  });
  const assumptions = value.assumptions.map((item) =>
    item.basis === 'stated' && !matchesEvidence(item.evidence, source)
      ? { ...item, basis: 'inferred' as const, evidence: '' }
      : { ...item, evidence: matchesEvidence(item.evidence, source) ? item.evidence : '' },
  );
  const groundedTopics = new Set<RiskTopic>([
    ...redFlags.map((item) => item.topic),
    ...value.orangeFlags
      .filter((item) => !item.evidence || matchesEvidence(item.evidence, source))
      .map((item) => item.topic),
    ...assumptions.map((item) => item.topic),
  ]);
  for (const flag of value.redFlags.filter((item) => !matchesEvidence(item.evidence, source))) {
    orangeFlags.push({
      topic: flag.topic,
      title: `${RISK_TOPIC_LABELS[flag.topic]}待核验`,
      evidence: '',
      detail: '评审提出了阻断判断，但无法核对其原文依据，已降为待澄清问题。',
      missing: '可核对的原文事实和判断依据',
      question: `请补充${RISK_TOPIC_LABELS[flag.topic]}相关事实与适用边界。`,
      remedy: '提供原始依据后重新评估，不能据当前材料认定存在阻断事实。',
    });
  }
  return {
    redFlags,
    orangeFlags,
    assumptions,
    failureModes: value.failureModes
      .filter((item) => item.basedOn.some((topic) => groundedTopics.has(topic)))
      .map((item) => ({
        ...item,
        basedOn: item.basedOn.filter((topic) => groundedTopics.has(topic)),
      })),
  };
}

function combine<K extends keyof ReviewDiagnostics>(
  reviews: InvestorReview[],
  key: K,
  identity: (item: ReviewDiagnostics[K][number]) => string,
): Attributed<ReviewDiagnostics[K][number]>[] {
  const result = new Map<string, Attributed<ReviewDiagnostics[K][number]>>();
  for (const review of reviews)
    for (const item of review.diagnostics[key]) {
      const id = identity(item);
      const existing = result.get(id);
      if (existing) {
        if (!existing.investorIds.includes(review.investorId))
          existing.investorIds.push(review.investorId);
      } else result.set(id, { ...item, investorIds: [review.investorId] });
    }
  return [...result.values()];
}

export function aggregateDiagnostics(reviews: InvestorReview[]): ReportDiagnostics {
  const redFlags = combine(
    reviews,
    'redFlags',
    (item) => `${item.topic}:${normalize(item.evidence)}`,
  );
  const orangeFlags = combine(
    reviews,
    'orangeFlags',
    (item) => `${item.topic}:${normalize(item.question)}`,
  );
  const assumptions = combine(
    reviews,
    'assumptions',
    (item) => `${item.topic}:${normalize(item.statement)}`,
  );
  const failureModes = combine(
    reviews,
    'failureModes',
    (item) => `${item.mechanism}:${normalize(item.condition)}`,
  );
  return {
    redFlags,
    orangeFlags,
    assumptions,
    failureModes,
    reviewedInvestors: reviews.length,
    gate: redFlags.length
      ? 'blocked'
      : orangeFlags.length
        ? 'clarify'
        : assumptions.length
          ? 'validate'
          : 'clear',
  };
}

export function decisionLabel(report: Pick<EvaluationReport, 'diagnostics' | 'verdict'>): string {
  if (report.diagnostics?.redFlags.length) return '红旗阻断';
  if (report.verdict === 'watch' && report.diagnostics?.orangeFlags.length) return '补证再议';
  if (report.verdict === 'watch' && report.diagnostics?.assumptions.length) return '假设待验';
  return VOTE_LABELS[report.verdict];
}

/** Only counts, controlled categories and conditional scenarios enter a public poster. */
export function publicDiagnosticSummary(report: Pick<EvaluationReport, 'diagnostics' | 'verdict'>) {
  const diagnostic = report.diagnostics;
  const labels = (items: { topic: RiskTopic }[]) => {
    const topics = [...new Set(items.map((item) => RISK_TOPIC_LABELS[item.topic]))];
    return topics.slice(0, 3).join(' / ') + (topics.length > 3 ? ' 等' : '');
  };
  if (!diagnostic)
    return {
      checked: false,
      label: decisionLabel(report),
      counts: '红橙旗 / 失败路径 / 假设：未检查',
      red: '旧报告未做专项检查，请重新评估',
      orange: '',
      assumptions: '',
      death: '尚未做失败情景推演',
      headline: '先补一次风险检查，再谈投资结论。',
    };
  return {
    checked: true,
    label: decisionLabel(report),
    counts: `红旗 ${diagnostic.redFlags.length} · 橙旗 ${diagnostic.orangeFlags.length} · 死因 ${diagnostic.failureModes.length} · 假设 ${diagnostic.assumptions.length}`,
    red: diagnostic.redFlags.length ? labels(diagnostic.redFlags) : '本次未检出',
    orange: diagnostic.orangeFlags.length ? labels(diagnostic.orangeFlags) : '本次未检出',
    assumptions: diagnostic.assumptions.length ? labels(diagnostic.assumptions) : '本次未检出',
    death: diagnostic.failureModes.length
      ? FAILURE_PUBLIC_COPY[diagnostic.failureModes[0].mechanism]
      : '资料尚不足以形成可追溯的失败路径。',
    headline: diagnostic.redFlags.length
      ? '最大的风险，不该被总分平均掉。'
      : diagnostic.orangeFlags.length
        ? '最难的追问，还藏在你没写清的地方。'
        : diagnostic.assumptions.length
          ? '故事讲通了，关键假设还没跑通。'
          : '先核验证据，再去谈下一轮。',
  };
}
