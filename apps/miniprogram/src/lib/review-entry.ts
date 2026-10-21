import { DEFAULT_PREFERENCES, INDUSTRY_IDS, ROUND_IDS, STAGES, createDemoReport, panelPreferencesSchema } from '@pitchcoach/shared';
import type { BillingStatus, EvaluationReport, IndustryId, JobStatus, PreferenceId, RoundId, Submission } from '@pitchcoach/shared';
import { ref } from 'vue';
import { randomPanelPreferences } from './investor-selection';

export interface PitchDraft {
  projectName: string; industry: IndustryId; round: RoundId; preferences: PreferenceId[];
  stage: Submission['stage']; description: string; bpText: string; tone: Submission['tone'];
  consent: boolean; expandedBP: boolean; filename: string; exampleFilled: boolean; pendingJobId: string;
}
let draft: PitchDraft | undefined;
let draftEpoch = 0;
let starting: Promise<JobStatus> | undefined;
// Task identity survives page/account-quote invalidation; balance data does not.
const knownRecoverable = ref('');
let entryNotice = '';
export const getPitchDraft = () => draft;
export const getDraftEpoch = () => draftEpoch;
export const savePitchDraft = (value?: PitchDraft, expectedEpoch = draftEpoch) => { if (expectedEpoch === draftEpoch) draft = value; };
export const getStartingEvaluation = () => starting;
export const setStartingEvaluation = (value?: Promise<JobStatus>) => { starting = value; };
export const rememberBilling = (value: BillingStatus) => { knownRecoverable.value = value.recoverableJobId || ''; };
export const getKnownRecoverable = () => knownRecoverable.value;
export const clearRecoverable = () => { knownRecoverable.value = ''; if (draft) draft.pendingJobId = ''; };
export const takeEntryNotice = () => { const value = entryNotice; entryNotice = ''; return value; };
export const hasDraftContent = (value?: PitchDraft) => Boolean(value && (value.projectName.trim() || value.description.trim() || value.bpText.trim() || value.filename || value.consent || value.exampleFilled));
export const draftReplacementBlocked = () => Boolean(starting || knownRecoverable.value || draft?.pendingJobId);
export function emptyDraft(): PitchDraft {
  return { projectName: '', industry: 'ai', round: 'angel', preferences: randomPanelPreferences(), stage: '已有原型', description: '', bpText: '', tone: 'sharp', consent: false, expandedBP: false, filename: '', exampleFilled: false, pendingJobId: '' };
}
export function freePreviewReport(industry: IndustryId, tone: Submission['tone'], round: RoundId, preferences: readonly PreferenceId[]) {
  const selected = panelPreferencesSchema.safeParse(preferences);
  return createDemoReport(industry, tone, round, selected.success ? selected.data : [...DEFAULT_PREFERENCES]);
}
/** Report schemas deliberately contain no original description/BP. Only safe metadata is carried. */
export function draftFromReport(report: EvaluationReport): { draft: PitchDraft; usedDefaults: boolean } {
  const next = emptyDraft();
  const prefs = panelPreferencesSchema.safeParse(report.preferences);
  let usedDefaults = !report.preferences || !prefs.success;
  next.projectName = typeof report.projectName === 'string' ? report.projectName.slice(0, 32) : '';
  if (INDUSTRY_IDS.includes(report.industry)) next.industry = report.industry; else usedDefaults = true;
  if (ROUND_IDS.includes(report.round)) next.round = report.round; else usedDefaults = true;
  if ((STAGES as readonly string[]).includes(report.stage)) next.stage = report.stage as Submission['stage']; else usedDefaults = true;
  if (report.tone === 'balanced' || report.tone === 'sharp') next.tone = report.tone; else usedDefaults = true;
  if (prefs.success && report.preferences) next.preferences = prefs.data;
  return { draft: next, usedDefaults };
}
function confirmReplacement(reassessment: boolean) {
  return new Promise<boolean>((resolve) => uni.showModal({
    title: reassessment ? '替换当前草稿，开始新一轮？' : '清空草稿，评审新项目？',
    content: reassessment
      ? '这会清除当前未提交的介绍与BP，仅带入所选报告的名称和设置。新资料需要重新填写并授权，已保存报告和已付款额度保留。'
      : '这会清除当前未提交的名称、介绍与BP，开始一个新项目。已保存报告和已付款额度保留。',
    confirmText: '替换并继续', cancelText: '保留原草稿', confirmColor: '#2f684e',
    success: (result) => resolve(result.confirm), fail: () => resolve(false),
  }));
}
export async function openReviewEntry(options: { intent?: 'continue' | 'new'; report?: EvaluationReport; industry?: IndustryId; round?: RoundId } = {}) {
  const report = options.report?.mode === 'live' ? options.report : undefined;
  const replaces = Boolean(report || options.intent === 'new');
  if (replaces && draftReplacementBlocked()) {
    uni.showToast({ title: '请先继续已有评审并领取报告，本次未替换草稿', icon: 'none' });
    uni.reLaunch({ url: '/pages/pitch/index' });
    return false;
  }
  if (replaces && hasDraftContent(draft)) {
    if (!await confirmReplacement(Boolean(report))) return false;
    if (draftReplacementBlocked()) return false;
  }
  if (report) {
    const result = draftFromReport(report);
    draftEpoch++;
    draft = result.draft;
    entryNotice = `仅带入所选报告的名称和设置，请重新填写最新介绍、补证材料并授权。${result.usedDefaults ? '旧报告部分设置缺失，已使用推荐设置，请检查。' : ''}`;
  } else if (options.intent === 'new') { draftEpoch++; draft = emptyDraft(); }
  else if (draft?.exampleFilled && !draftReplacementBlocked()) {
    const current = draft;
    draftEpoch++;
    draft = { ...emptyDraft(), industry: current.industry, round: current.round };
    entryNotice = '已清除虚构示例资料，请填写你自己的项目并重新授权。';
  }
  const query: string[] = [];
  // Existing real drafts take priority over a demo/share context.
  if (!hasDraftContent(draft) && !draftReplacementBlocked()) {
    if (options.industry && INDUSTRY_IDS.includes(options.industry)) query.push(`industry=${options.industry}`);
    if (options.round && ROUND_IDS.includes(options.round)) query.push(`round=${options.round}`);
  }
  uni.reLaunch({ url: `/pages/pitch/index${query.length ? `?${query.join('&')}` : ''}` });
  return true;
}
