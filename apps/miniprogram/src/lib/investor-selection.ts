import { PANEL_SIZE, PREFERENCE_IDS } from '@pitchcoach/shared';
import type { PreferenceId } from '@pitchcoach/shared';

/** Pick once for a new project; never replace a user's saved or edited selection. */
export function randomPanelPreferences(random: () => number = Math.random): PreferenceId[] {
  const pool = [...PREFERENCE_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PANEL_SIZE);
}

export function togglePanelPreference(selected: readonly PreferenceId[], id: PreferenceId) {
  if (selected.includes(id)) return { preferences: selected.filter((item) => item !== id), error: '' };
  if (selected.length < PANEL_SIZE) return { preferences: [...selected, id], error: '' };
  return { preferences: [...selected], error: '已选满 3 位，请先取消一位再更换。' };
}
