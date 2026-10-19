import { DIMENSIONS, VOTE_LABELS, getPanel, getRound, getWeights } from './catalog';
import type {
  DimensionReview,
  EvaluationReport,
  InvestorReview,
  ReviewContent,
  Submission,
} from './schema';

export const DISCLAIMER =
  'AI 模拟投委会，仅用于项目自检；不代表任何机构的投资意向或投资承诺。资料为用户陈述，未经独立尽调。';

/** Evidence must be an exact quotation from the submission, never a model invention. */
export function verifyEvidence(content: ReviewContent, source: string): ReviewContent {
  const normalize = (text: string) => text.replace(/\s+/g, '').normalize('NFKC');
  const normalized = normalize(source);
  return {
    ...content,
    dimensions: content.dimensions.map((item) => {
      if (item.score === null) return { ...item, evidence: '' };
      if (normalize(item.evidence).length >= 4 && normalized.includes(normalize(item.evidence)))
        return item;
      return {
        ...item,
        score: null,
        evidence: '',
        reason: '该维度缺少可核对的原文证据，请补充后再评估。',
      };
    }),
  };
}

export function weightedScore(
  dimensions: DimensionReview[],
  submission: Pick<Submission, 'industry' | 'round'>,
) {
  const weights = getWeights(submission.industry, submission.round);
  const observed = dimensions.filter((item) => item.score !== null);
  const coverage = observed.reduce((sum, item) => sum + weights[item.id], 0);
  const score = coverage
    ? Math.round(observed.reduce((sum, item) => sum + item.score! * weights[item.id], 0) / coverage)
    : null;
  return { score, coverage };
}

export function prepareReview(
  content: ReviewContent,
  investorId: string,
  model: string,
  submission: Submission,
): InvestorReview {
  const verified = verifyEvidence(
    content,
    `${submission.projectName}\n${submission.description}\n${submission.bpText}`,
  );
  const metrics = weightedScore(verified.dimensions, submission);
  return {
    ...verified,
    ...metrics,
    vote: metrics.coverage < 60 ? 'insufficient' : verified.vote,
    investorId,
    model,
  };
}

export function aggregateReport(
  submission: Submission,
  reviews: InvestorReview[],
  options: { id: string; mode: 'demo' | 'live'; createdAt?: string },
): EvaluationReport {
  if (!reviews.length) throw new Error('EMPTY_PANEL');
  const weights = getWeights(submission.industry, submission.round);
  const dimensions = DIMENSIONS.map((dimension) => {
    const items = reviews.map(
      (review) => review.dimensions.find((item) => item.id === dimension.id)!,
    );
    const observed = items.filter((item) => item.score !== null);
    const lowest = [...observed].sort((a, b) => a.score! - b.score!)[0];
    return {
      ...dimension,
      weight: weights[dimension.id],
      score: observed.length
        ? Math.round(observed.reduce((sum, item) => sum + item.score!, 0) / observed.length)
        : null,
      evidence: lowest?.evidence ?? '',
      reason: lowest?.reason ?? items[0].reason,
      action: lowest?.action ?? items[0].action,
    };
  });
  const { score, coverage } = weightedScore(dimensions, submission);
  const missingInvestors = getPanel(submission.industry, submission.round)
    .filter((investor) => !reviews.some((review) => review.investorId === investor.id))
    .map((investor) => investor.id);
  const votes = reviews.map((review) => review.vote);
  const verdict =
    coverage < 60 ||
    reviews.length < 2 ||
    votes.filter((vote) => vote === 'insufficient').length >= 2
      ? 'insufficient'
      : votes.filter((vote) => vote === 'invest').length >= 2 &&
          votes.length === 3 &&
          coverage >= 80
        ? 'invest'
        : votes.filter((vote) => vote === 'pass').length >= 2
          ? 'pass'
          : 'watch';
  const actions = [...dimensions]
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || b.weight - a.weight)
    .slice(0, 4)
    .map((dimension, index) => ({
      dimension: dimension.name,
      task: dimension.action,
      priority: index + 1,
    }));
  const sharpest = [...reviews].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0];
  return {
    id: options.id,
    version: 1,
    createdAt: options.createdAt ?? new Date().toISOString(),
    mode: options.mode,
    projectName: submission.projectName,
    industry: submission.industry,
    round: submission.round,
    stage: submission.stage,
    tone: submission.tone,
    score,
    coverage,
    verdict,
    headline: verdict === 'insufficient' ? '故事可以很大，证据还要补上。' : sharpest.oneLiner,
    summary: `${getRound(submission.round).name}投委会结论：${VOTE_LABELS[verdict]}。${reviews.length} 位 AI 投资人完成审阅，评分证据覆盖 ${coverage}%。${missingInvestors.length ? '部分评审未完成，结论已保守处理。' : ''}`,
    dimensions,
    investors: reviews,
    missingInvestors,
    actions,
    disclaimer: DISCLAIMER,
  };
}
