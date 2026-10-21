import { describe, expect, it } from 'vitest';
import { INDUSTRY_IDS, PREFERENCE_IDS, ROUND_IDS, getSpecialist } from '@pitchcoach/shared';
import { homeQuestions } from './home-questions';

describe('首页跨行业、轮次与偏好的真实追问', () => {
  it('轮播覆盖全部八个行业、六个轮次与六种视角', () => {
    const entries = homeQuestions();
    expect(new Set(entries.map((item) => item.industry))).toEqual(new Set(INDUSTRY_IDS));
    expect(new Set(entries.map((item) => item.round))).toEqual(new Set(ROUND_IDS));
    expect(new Set(entries.map((item) => item.preference))).toEqual(new Set(PREFERENCE_IDS));
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length);
  });
  it('展示实际投委目录的行业和轮次问题', () => {
    for (const entry of homeQuestions()) {
      const actual = getSpecialist(entry.industry, entry.round, entry.preference);
      expect(entry.question).toBe(actual.question);
      expect(entry.roundQuestion).toBe(actual.roundQuestion);
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.roundQuestion.length).toBeGreaterThan(0);
    }
  });
  it('邀请进入时优先展示对应行业与轮次，并保留多样性', () => {
    const entries = homeQuestions({ industry: 'saas', round: 'pre-a' });
    expect(entries[0]).toMatchObject({ industry: 'saas', round: 'pre-a' });
    expect(new Set(entries.map((item) => item.round)).size).toBe(ROUND_IDS.length);
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length);
  });
});
