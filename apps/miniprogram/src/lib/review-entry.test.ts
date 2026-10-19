import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createDemoReport } from '@pitchcoach/shared';
import type { BillingStatus, EvaluationReport, JobStatus } from '@pitchcoach/shared';
import { clearRecoverable, draftFromReport, emptyDraft, freePreviewReport, getDraftEpoch, getKnownRecoverable, getPitchDraft, openReviewEntry, rememberBilling, savePitchDraft, setStartingEvaluation } from './review-entry';
let accepted = true;
const modal = vi.fn((options: { success: (result: { confirm: boolean }) => void }) => options.success({ confirm: accepted }));
const reLaunch = vi.fn();
const toast = vi.fn();
const report = (): EvaluationReport => ({ ...createDemoReport('ai', 'balanced', 'angel'), mode: 'live', projectName: '真实项目' });
beforeEach(() => {
  accepted = true;
  clearRecoverable(); savePitchDraft(undefined); setStartingEvaluation(undefined);
  vi.clearAllMocks();
  vi.stubGlobal('uni', { showModal: modal, reLaunch, showToast: toast });
});
describe('会话草稿与补证复评', () => {
  it('账单失效或重新进入页面不丢已知原任务，领取或失效后响应式清除', () => {
    const account = ref<BillingStatus>();
    const firstPageTask = computed(() => account.value?.recoverableJobId || getKnownRecoverable());
    expect(firstPageTask.value).toBe('');
    account.value = { enabled: true, priceFen: 188, credits: 1, orders: [], supportContact: '', recoverableJobId: 'original-task' };
    rememberBilling(account.value);
    expect(firstPageTask.value).toBe('original-task');
    account.value = undefined;
    expect(account.value).toBeUndefined();
    expect(firstPageTask.value).toBe('original-task');
    const reenteredPageTask = computed(getKnownRecoverable);
    expect(reenteredPageTask.value).toBe('original-task');
    savePitchDraft({ ...emptyDraft(), pendingJobId: 'original-task' });
    clearRecoverable();
    expect(firstPageTask.value).toBe('');
    expect(reenteredPageTask.value).toBe('');
    expect(getPitchDraft()?.pendingJobId).toBe('');
  });
  it('阵容不足时仍可看固定免费示例，且不改真实草稿或偏好', () => {
    const prior = { ...emptyDraft(), projectName: '真实草稿', description: '真实材料', preferences: ['technology', 'growth'] as const };
    const preferences = [...prior.preferences];
    const draft = { ...prior, preferences };
    savePitchDraft(draft);
    const preview = freePreviewReport('ai', 'balanced', 'angel', preferences);
    expect(preview.mode).toBe('demo');
    expect(preview.preferences).toHaveLength(3);
    expect(new Set(preview.preferences).size).toBe(3);
    expect(getPitchDraft()).toBe(draft);
    expect(preferences).toEqual(['technology', 'growth']);
    expect(preview.projectName).not.toBe('真实草稿');
  });
  it('仅复制真实报告元数据，正文文件授权与示例状态均重置', () => {
    const source = { ...report(), description: 'never restore', bpText: 'private BP', filename: 'old.pdf', consent: true, exampleFilled: true };
    const result = draftFromReport(source);
    expect(result.draft).toMatchObject({ projectName: '真实项目', industry: 'ai', round: 'angel', tone: 'balanced', description: '', bpText: '', filename: '', consent: false, exampleFilled: false, pendingJobId: '' });
    expect(result.draft.preferences).toEqual(source.preferences);
  });
  it('旧报告缺少设置时使用合法推荐值并提示', () => {
    const source = { ...report(), preferences: undefined, stage: 'not-a-stage', industry: 'invalid', round: 'invalid', tone: 'invalid' } as unknown as EvaluationReport;
    const result = draftFromReport(source);
    expect(result.usedDefaults).toBe(true);
    expect(result.draft).toMatchObject({ industry: 'ai', round: 'angel', stage: '已有原型', tone: 'sharp' });
    expect(result.draft.preferences).toHaveLength(3);
  });
  it('相同名字的现有草稿也须确认，取消不改内容或导航', async () => {
    const prior = { ...emptyDraft(), projectName: '真实项目', description: '仍在填写的真实材料', bpText: 'original', consent: true };
    savePitchDraft(prior); accepted = false;
    expect(await openReviewEntry({ report: report() })).toBe(false);
    expect(modal).toHaveBeenCalledOnce();
    expect(getPitchDraft()).toBe(prior);
    expect(reLaunch).not.toHaveBeenCalled();
  });
  it('新种子阻止旧页面晚到的onUnload覆盖，替换后只进表单', async () => {
    const old = { ...emptyDraft(), projectName: '旧项目', bpText: 'old BP' };
    savePitchDraft(old);
    const oldEpoch = getDraftEpoch();
    await openReviewEntry({ report: report() });
    savePitchDraft(old, oldEpoch);
    expect(getPitchDraft()?.projectName).toBe('真实项目');
    expect(getPitchDraft()?.bpText).toBe('');
    expect(reLaunch).toHaveBeenCalledExactlyOnceWith({ url: '/pages/pitch/index' });
  });
  it('从示例回到自己的项目保留真实草稿，不导入示例元数据', async () => {
    const real = { ...emptyDraft(), projectName: '真实草稿', bpText: 'private', industry: 'health' as const, consent: true };
    savePitchDraft(real);
    await openReviewEntry({ report: createDemoReport(), industry: 'ai', round: 'angel' });
    expect(getPitchDraft()).toBe(real);
    expect(modal).not.toHaveBeenCalled();
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/pitch/index' });
  });
  it('虚构填写材料不会作为自己的项目继续，也不保留授权', async () => {
    savePitchDraft({ ...emptyDraft(), projectName: '虚构样例', description: '虚构文字', bpText: '虚构BP', consent: true, exampleFilled: true });
    await openReviewEntry();
    expect(getPitchDraft()).toMatchObject({ projectName: '', description: '', bpText: '', consent: false, exampleFilled: false });
  });
  it('已知原任务或提交中请求优先，复评不覆盖草稿或起付款', async () => {
    for (const kind of ['pending', 'recoverable', 'starting']) {
      clearRecoverable(); setStartingEvaluation(undefined);
      const prior = { ...emptyDraft(), projectName: '进行中的项目', pendingJobId: kind === 'pending' ? 'job-id' : '' };
      savePitchDraft(prior);
      if (kind === 'recoverable') rememberBilling({ recoverableJobId: 'job-id' } as BillingStatus);
      if (kind === 'starting') setStartingEvaluation(new Promise<JobStatus>(() => {}));
      expect(await openReviewEntry({ report: report() })).toBe(false);
      expect(getPitchDraft()).toBe(prior);
    }
    expect(modal).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(3);
  });
});
