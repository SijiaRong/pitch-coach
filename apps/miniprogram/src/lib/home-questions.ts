import { INDUSTRIES, FUNDING_ROUNDS, PREFERENCES, getSpecialist } from '@pitchcoach/shared';
import type { IndustryId, RoundId } from '@pitchcoach/shared';

/** A short, varied tour of actual catalog questions, without fictional projects. */
export function homeQuestions(context?: { industry: IndustryId; round: RoundId }) {
  const entries = INDUSTRIES.map((industry, index) =>
    getSpecialist(industry.id, FUNDING_ROUNDS[index % FUNDING_ROUNDS.length].id,
      PREFERENCES[(index * 5) % PREFERENCES.length].id),
  );
  if (context) {
    const first = getSpecialist(context.industry, context.round, 'product');
    return [first, ...entries.filter((item) => item.id !== first.id)];
  }
  return entries;
}
