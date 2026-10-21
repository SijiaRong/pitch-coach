import { describe, expect, it } from 'vitest';
import { PREFERENCE_IDS, panelPreferencesSchema } from '@pitchcoach/shared';
import { randomPanelPreferences, togglePanelPreference } from './investor-selection';

describe('三人投委会选择', () => {
  it('为新项目随机预选三位不同偏好，且不修改候选目录', () => {
    const original = [...PREFERENCE_IDS];
    const first = randomPanelPreferences(() => 0);
    const second = randomPanelPreferences(() => 0.99);
    expect(panelPreferencesSchema.safeParse(first).success).toBe(true);
    expect(panelPreferencesSchema.safeParse(second).success).toBe(true);
    expect(first).not.toEqual(second);
    expect(PREFERENCE_IDS).toEqual(original);
  });
  it('已选满时禁止第四位，先取消再补选，保留其他选择', () => {
    const initial = ['technology', 'growth', 'financial'] as const;
    const full = togglePanelPreference(initial, 'product');
    expect(full.preferences).toEqual(initial);
    expect(full.error).toContain('先取消一位');
    const removed = togglePanelPreference(full.preferences, 'growth');
    expect(removed.preferences).toEqual(['technology', 'financial']);
    expect(panelPreferencesSchema.safeParse(removed.preferences).success).toBe(false);
    const replaced = togglePanelPreference(removed.preferences, 'product');
    expect(replaced.preferences).toEqual(['technology', 'financial', 'product']);
    expect(replaced.error).toBe('');
    expect(panelPreferencesSchema.safeParse(replaced.preferences).success).toBe(true);
    expect(initial).toEqual(['technology', 'growth', 'financial']);
  });
});
