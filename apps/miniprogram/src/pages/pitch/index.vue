<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onBackPress, onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
  EXAMPLES,
  DEFAULT_PREFERENCES,
  FUNDING_ROUNDS,
  INDUSTRIES,
  INDUSTRY_IDS,
  ROUND_IDS,
  PANEL_SIZE,
  PREFERENCES,
  STAGES,
  getIndustry,
  getSpecialist,
  panelPreferencesSchema,
  getRound,
  submissionSchema,
  getPreference,
} from '@pitchcoach/shared';
import type {
  BillingStatus,
  IndustryId,
  PreferenceId,
  RoundId,
  Submission,
} from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import {
  chooseDocument,
  deleteEvaluation,
  evaluate,
  getConfig,
  pollEvaluation,
  uploadDocument,
  getBillingStatus,
  createPaymentOrder,
  queryPaymentOrder,
  payWithWechat,
  ApiFailure,
} from '@/lib/api';
import { ensureReviewCredit } from '@/lib/payment-flow';
import { openReport } from '@/lib/storage';
import ReviewOfferStatus from '@/components/ReviewOfferStatus.vue';
import { parseReviewOffer, formatPrice } from '@/lib/review-offer';
import type { ReviewOffer } from '@/lib/review-offer';
import { aboutPath } from '@/lib/share-entry';
import { clearRecoverable, freePreviewReport, getDraftEpoch, getKnownRecoverable, getPitchDraft, savePitchDraft, getStartingEvaluation, setStartingEvaluation, rememberBilling, takeEntryNotice } from '@/lib/review-entry';
import type { PitchDraft } from '@/lib/review-entry';
import { hasAIDataConsent, setAIDataConsent } from '@/lib/privacy';
const memoryDraft = getPitchDraft();
const draftEpoch = getDraftEpoch();

const inheritedStart = getStartingEvaluation();
const projectName = ref(memoryDraft?.projectName || '');
const industry = ref<IndustryId>(memoryDraft?.industry || 'ai');
const round = ref<RoundId>(memoryDraft?.round || 'angel');
const preferences = ref<PreferenceId[]>(memoryDraft ? [...memoryDraft.preferences] : [...DEFAULT_PREFERENCES]);
const preferenceEditor = ref(false);
const settingsExpanded = ref(false);
const preferenceError = ref('');
const stage = ref<Submission['stage']>(memoryDraft?.stage || '已有原型');
const description = ref(memoryDraft?.description || '');
const bpText = ref(memoryDraft?.bpText || '');
const tone = ref<Submission['tone']>(memoryDraft?.tone || 'sharp');
const consent = ref(Boolean(memoryDraft?.consent && hasAIDataConsent()));
const expandedBP = ref(memoryDraft?.expandedBP || false);
const filename = ref(memoryDraft?.filename || '');
const uploading = ref(false);
const busy = ref(Boolean(inheritedStart));
const completed = ref(0);
const error = ref('');
const uploadError = ref('');
const uploadNotice = ref('');
const billingError = ref('');
const notice = ref(takeEntryNotice());
const draftRestored = ref(Boolean(memoryDraft && (memoryDraft.projectName || memoryDraft.description || memoryDraft.bpText)));
const attempted = ref(false);
const exampleFilled = ref(memoryDraft?.exampleFilled || false);
const confirmingExample = ref(false);
const configLoading = ref(false);
const serviceState = ref<'checking' | 'ready' | 'unavailable' | 'error' | 'incomplete'>('checking');
const paymentsEnabled = ref(false);
const currentOffer = ref<ReviewOffer>();
const priceLabel = computed(() => currentOffer.value ? formatPrice(currentOffer.value.reviewPriceFen) : '');
const offerState = computed(() => configLoading.value ? 'loading' : currentOffer.value ? 'ready' : 'error');
const billing = ref<BillingStatus>();
const checkingOrders = ref(false);
const phase = ref<'checking' | 'payment' | 'confirming' | 'starting' | 'reviewing'>(inheritedStart ? 'starting' : 'checking');
const pendingJobId = ref(memoryDraft?.pendingJobId || '');
const resumingJob = ref(false);
const cancelling = ref(false);
const ordersExpanded = ref(false);
const recoverableJobId = computed(() => pendingJobId.value || billing.value?.recoverableJobId || getKnownRecoverable());
const paymentLabel = computed(() => {
  if (recoverableJobId.value) return '继续已有评审 / 领取报告';
  if (checkingOrders.value) return '正在确认订单与额度…';
  if (configLoading.value) return '正在连接评审服务…';
  if (serviceState.value === 'incomplete') return '请选满三位评审教练';
  if (serviceState.value !== 'ready') return '真实评审暂不可用';
  if (billing.value?.orders.some((order) => order.status === 'pending')) return '查询订单与额度';
  if (billing.value?.credits) return '使用 1 次额度，开始评审';
  if (paymentsEnabled.value && !billing.value) return '确认额度与评审';
  return paymentsEnabled.value ? `${priceLabel.value} 支付并评审` : '开始 AI 评审';
});
const settingsSummary = computed(() => `${currentIndustry.value.name} · ${currentRound.value.name} · ${stage.value} · ${tone.value === 'sharp' ? '犀利版' : '专业版'}`);
const preferenceSummary = computed(() => preferences.value.map((id) => getPreference(id).name).join(' / '));
const availability = computed(() => ({
  checking: '正在连接真实 AI 评审服务',
  ready: '真实 AI 评审已就绪',
  unavailable: '当前评审阵容暂不可用，可免费查看示例',
  error: '暂时连接不到服务，可免费查看示例',
  incomplete: '请选满三种评审偏好，再确认服务状态',
})[serviceState.value]);
const currentIndustry = computed(() => getIndustry(industry.value));
const currentRound = computed(() => getRound(round.value));
const panel = computed(() =>
  preferences.value.map((preference) => getSpecialist(industry.value, round.value, preference)),
);
const panelReady = computed(() => preferences.value.length === PANEL_SIZE);
const panelKey = computed(() => `${industry.value}|${round.value}|${preferences.value.join(',')}`);
const submissionResult = computed(() => submissionSchema.safeParse({
  projectName: projectName.value,
  industry: industry.value,
  round: round.value,
  preferences: preferences.value,
  stage: stage.value,
  description: description.value,
  bpText: bpText.value,
  tone: tone.value,
  consent: consent.value,
}));
const fieldErrors = computed<Record<string, string>>(() => {
  const fields: Record<string, string> = {};
  if (attempted.value && !submissionResult.value.success)
    for (const issue of submissionResult.value.error.issues)
      fields[String(issue.path[0])] ||= issue.message;
  return fields;
});
const busyTitle = computed(() => ({
  checking: '正在确认服务与额度',
  payment: '请在微信中完成支付',
  confirming: '正在确认支付结果',
  starting: '正在提交项目资料',
  reviewing: '已向三位教练发起请求',
})[phase.value]);
const busyDescription = computed(() => ({
  checking: '先核对已有订单，已有额度或报告时不会重复付款。',
  payment: `本次真实评审 ${priceLabel.value}，支付结果以服务端确认为准。`,
  confirming: '请勿重复付款。确认后会自动开始评审，已付款额度会保留。',
  starting: '资料提交成功后，三位教练将分别给出反馈。',
  reviewing: `已完成 ${completed.value} / ${PANEL_SIZE}，最终报告按实际完成展示。`,
})[phase.value]);
let operation = 0;
let configGeneration = 0;
let requestedPanelKey = '';
let pageLoaded = false;
let pageUnloaded = false;

function selectedPanel() {
  const parsed = panelPreferencesSchema.safeParse(preferences.value);
  return parsed.success
    ? { industry: industry.value, round: round.value, preferences: parsed.data }
    : undefined;
}

watch(panelKey, () => {
  if (pageLoaded && !pageUnloaded) void loadConfig();
});

function selectPanel(value: { industry?: unknown; round?: unknown; preferences?: unknown }) {
  const parsed = panelPreferencesSchema.safeParse(value?.preferences);
  if (!value || !INDUSTRY_IDS.includes(value.industry as IndustryId) ||
      !ROUND_IDS.includes(value.round as RoundId) || !parsed.success) return;
  industry.value = value.industry as IndustryId;
  round.value = value.round as RoundId;
  preferences.value = parsed.data;
  preferenceError.value = '';
  notice.value = '评审阵容已更新，已填写的项目资料已保留。';
}

onLoad((options) => {
  if (options?.industry && INDUSTRY_IDS.includes(options.industry as IndustryId))
    industry.value = options.industry as IndustryId;
  if (options?.round && ROUND_IDS.includes(options.round as RoundId))
    round.value = options.round as RoundId;
  if (options?.preferences) {
    const parsed = panelPreferencesSchema.safeParse(options.preferences.split(','));
    if (parsed.success) preferences.value = parsed.data;
  }
  uni.$on('pitch:select-panel', selectPanel);
  pageLoaded = true;
  if (inheritedStart) {
    const generation = ++operation;
    void inheritedStart.then((job) => {
      if (pageUnloaded || generation !== operation) return;
      pendingJobId.value = job.id;
      busy.value = false;
      notice.value = '项目资料已提交，可继续查看原评审进度或领取报告。';
    }).catch((cause) => {
      if (pageUnloaded || generation !== operation) return;
      busy.value = false;
      error.value = cause instanceof Error ? cause.message : '提交未确认，请稍后重试';
    });
  }
});
onShow(() => {
  // Withdrawal applies to a restored draft, but a previous global choice must
  // never pre-authorize newly entered or reassessment materials.
  if (!hasAIDataConsent()) consent.value = false;
  if (!pageLoaded || pageUnloaded || busy.value || getStartingEvaluation()) return;
  // Cached account data is not a current balance. Refresh the public quote without
  // signing in; the next explicit account query/confirmation will read the ledger.
  if (!checkingOrders.value) billing.value = undefined;
  void loadConfig();
});
async function loadConfig() {
  const selection = selectedPanel();
  const key = panelKey.value;
  if (configLoading.value && requestedPanelKey === key) return;
  const generation = ++configGeneration;
  requestedPanelKey = key;
  currentOffer.value = undefined;
  if (!selection) {
    configLoading.value = false;
    serviceState.value = 'incomplete';
    settingsExpanded.value = true;
    preferenceEditor.value = true;
    return;
  }
  configLoading.value = true;
  serviceState.value = 'checking';
  try {
    const config = parseReviewOffer(await getConfig(selection));
    if (pageUnloaded || generation !== configGeneration || key !== panelKey.value) return;
    paymentsEnabled.value = config.paymentsEnabled;
    currentOffer.value = config;
    serviceState.value = config.liveAvailable ? 'ready' : 'unavailable';

  } catch {
    if (!pageUnloaded && generation === configGeneration && key === panelKey.value)
      { serviceState.value = 'error'; currentOffer.value = undefined; }
  } finally {
    if (generation === configGeneration) configLoading.value = false;
  }
}
async function refreshBilling() {
  if (checkingOrders.value) return;
  billingError.value = '';
  checkingOrders.value = true;
  try {
    const status = await getBillingStatus();
    const pending = status.orders.filter((order) => order.status === 'pending').slice(0, 3);
    let current = status;
    for (const order of pending) current = (await queryPaymentOrder(order.id)).billing;
    billing.value = current;
    rememberBilling(current);
    return current;
  } catch (cause) {
    billing.value = undefined;
    billingError.value = cause instanceof Error ? cause.message : '订单查询失败，请稍后重试';
  } finally {
    checkingOrders.value = false;
  }
}
const orderLabels: Record<string, string> = {
  pending: '待确认',
  paid: '可使用',
  reserved: '评审中',
  spent: '已使用',
  refund_hold: '退款处理中',
  refunded: '已退款',
};
onHide(() => savePitchDraft(captureDraft(), draftEpoch));
onUnload(() => {
  uni.$off('pitch:select-panel', selectPanel);
  operation++;
  configGeneration++;
  pageUnloaded = true;
  savePitchDraft(captureDraft(), draftEpoch);
  // Do not delete running paid jobs when navigation stops the local polling loop.
});
onBackPress(() => busy.value && phase.value === 'starting');

function captureDraft(): PitchDraft {
  return {
    projectName: projectName.value, industry: industry.value, round: round.value,
    preferences: [...preferences.value], stage: stage.value, description: description.value,
    bpText: bpText.value, tone: tone.value, consent: consent.value,
    expandedBP: expandedBP.value, filename: filename.value,
    exampleFilled: exampleFilled.value, pendingJobId: pendingJobId.value,
  };
}

function startReview(submission: Submission, requestKey: string) {
  const existing = getStartingEvaluation();
  if (existing) return existing;
  savePitchDraft(captureDraft(), draftEpoch);
  const request = evaluate(submission, requestKey).then((job) => {
    savePitchDraft({ ...(getPitchDraft() || captureDraft()), pendingJobId: job.id }, draftEpoch);
    return job;
  });
  setStartingEvaluation(request);
  void request.finally(() => {
    if (getStartingEvaluation() === request) setStartingEvaluation(undefined);
  }).catch(() => undefined);
  return request;
}

function scrollToField(field: string) {
  if (['industry', 'round', 'stage', 'tone', 'preferences'].includes(field)) settingsExpanded.value = true;
  if (field === 'preferences') preferenceEditor.value = true;
  if (field === 'bpText') expandedBP.value = true;
  void nextTick(() => uni.pageScrollTo({ selector: `#field-${field}`, duration: 250 }));
}

function confirmAction(title: string, content: string, confirmText: string, cancelText = '保留原内容') {
  return new Promise<boolean>((resolve) => uni.showModal({
    title, content, confirmText, cancelText, confirmColor: '#2f684e',
    success: (result) => resolve(result.confirm),
    fail: () => resolve(false),
  }));
}

async function clearDraft() {
  if (busy.value || uploading.value || confirmingExample.value || configLoading.value || checkingOrders.value || getStartingEvaluation()) return;
  if (recoverableJobId.value) {
    notice.value = '请先继续已有评审并领取报告，暂不能清空本次项目资料。';
    return;
  }
  if (!await confirmAction('清空资料，开始新项目？', '将清除本页的项目名称、介绍、补充正文和评审设置；已保存的报告与已付款额度会保留。', '清空重填', '保留草稿')) return;
  if (recoverableJobId.value || busy.value || uploading.value || checkingOrders.value || getStartingEvaluation()) return;
  projectName.value = '';
  description.value = '';
  bpText.value = '';
  industry.value = 'ai';
  round.value = 'angel';
  preferences.value = [...DEFAULT_PREFERENCES];
  stage.value = '已有原型';
  tone.value = 'sharp';
  consent.value = false;
  expandedBP.value = false;
  filename.value = '';
  exampleFilled.value = false;
  draftRestored.value = false;
  preferenceEditor.value = false;
  preferenceError.value = '';
  error.value = '';
  uploadError.value = '';
  uploadNotice.value = '';
  attempted.value = false;
  savePitchDraft(undefined);
  notice.value = '已清空填写内容，可以开始新的项目。';
  scrollToField('projectName');
}

function setStage(event: { detail: { value: string | number } }) {
  stage.value = STAGES[Number(event.detail.value)];
}
function toggleConsent() {
  consent.value = !consent.value;
  setAIDataConsent(consent.value);
}
function togglePreference(id: PreferenceId) {
  preferenceError.value = '';
  if (preferences.value.includes(id))
    preferences.value = preferences.value.filter((item) => item !== id);
  else if (preferences.value.length < PANEL_SIZE) preferences.value = [...preferences.value, id];
  else preferenceError.value = '先取消一种已选偏好，再邀请新的教练。';
}
function demo() {
  if (busy.value || uploading.value) return;
  if (!panelReady.value)
    uni.showToast({ title: '免费示例使用推荐阵容，你的选择已保留', icon: 'none' });
  openReport(freePreviewReport(industry.value, tone.value, round.value, preferences.value));
}
async function fillExample() {
  if (projectName.value.trim() || description.value.trim() || bpText.value.trim()) {
    if (!await confirmAction('替换为虚构示例？', '这会替换项目名称、介绍和补充资料。只想了解报告，也可以直接查看免费示例。', '填入示例')) return;
  }
  const example = EXAMPLES[industry.value];
  projectName.value = example.name;
  description.value = example.description;
  bpText.value = example.bp;
  stage.value = ['hardware', 'health', 'climate'].includes(industry.value)
    ? '已有用户'
    : '已有收入';
  expandedBP.value = true;
  filename.value = '';
  error.value = '';
  uploadError.value = '';
  uploadNotice.value = '';
  attempted.value = false;
  exampleFilled.value = true;
}
async function upload() {
  if (uploading.value || busy.value) return;
  uploadError.value = '';
  uploadNotice.value = '';
  if (!consent.value) {
    uploadError.value = '上传前，请先勾选上方的资料处理授权。';
    scrollToField('consent');
    return;
  }
  uploading.value = true;
  try {
    const file = await chooseDocument();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      uploadError.value = '文件不能超过 10 MB，请使用精简版 BP。';
      return;
    }
    if (bpText.value.trim() && !await confirmAction('替换补充资料？', '新文件提取的文字会替换现有正文，原内容不会合并。', '替换资料')) return;
    if (!consent.value) {
      uploadError.value = '资料授权已取消，本次未上传文件。';
      return;
    }
    const parsed = await uploadDocument(file.path);
    if (!parsed.text.trim()) {
      uploadError.value = '文件中未提取到文字，请粘贴正文；扫描图片请先转成文字。';
      return;
    }
    bpText.value = parsed.text;
    filename.value = file.name;
    expandedBP.value = true;
    if (parsed.truncated)
      uploadNotice.value = '已读取前 50,000 字，超出部分不参与评审。请检查提取结果。';
    else uploadNotice.value = '文字提取完成，请检查下方正文后再提交评审。';
    exampleFilled.value = false;
  } catch (cause) {
    uploadError.value = cause instanceof Error ? cause.message : '上传失败，请重试或直接粘贴正文';
  } finally {
    uploading.value = false;
  }
}
function pause() {
  if (phase.value === 'starting' || cancelling.value || getStartingEvaluation()) return;
  operation++;
  busy.value = false;
  notice.value = pendingJobId.value
    ? '已返回填写页，评审仍在进行。点击“继续已有评审”查看进度或领取报告。'
    : '已停止等待。若支付已完成，额度会保留，请先查询订单与额度。';
  if (paymentsEnabled.value) void refreshBilling();
}
async function cancel() {
  if (paymentsEnabled.value || resumingJob.value || cancelling.value || !pendingJobId.value) return;
  if (!await confirmAction('取消本次评审？', '尚未生成报告时取消会恢复试用次数；如果报告已经完成，将直接为你打开。', '确认取消', '继续等待')) return;
  if (!pendingJobId.value || !busy.value) return;
  cancelling.value = true;
  operation++;
  const id = pendingJobId.value;
  try {
    const result = await pollEvaluation(id);
    if (result.status === 'done' && result.report) {
      pendingJobId.value = '';
      busy.value = false;
      openReport(result.report);
      void deleteEvaluation(id).catch(() => undefined);
      return;
    }
    await deleteEvaluation(id);
    pendingJobId.value = '';
    busy.value = false;
    notice.value = '本次评审已取消，可以修改资料后重新开始。';
  } catch (cause) {
    busy.value = false;
    error.value = cause instanceof Error ? cause.message : '取消未确认，请继续查询原评审';
  } finally {
    cancelling.value = false;
    if (paymentsEnabled.value) void refreshBilling();
  }
}
async function submit() {
  if (!hasAIDataConsent()) consent.value = false;
  if (busy.value || uploading.value || confirmingExample.value || checkingOrders.value || getStartingEvaluation() || (configLoading.value && !recoverableJobId.value)) return;
  error.value = '';
  notice.value = '';
  if (!recoverableJobId.value && billing.value?.orders.some((order) => order.status === 'pending')) {
    await refreshBilling();
    notice.value = billing.value?.orders.some((order) => order.status === 'pending')
      ? '订单结果仍待确认。若已扣款，请勿重复付款。'
      : '订单与额度已更新，请确认下方按钮后继续。';
    return;
  }
  const purchasePrice = currentOffer.value && paymentsEnabled.value && billing.value && !billing.value.credits && !billing.value.orders.some((order) => order.status === 'pending') ? currentOffer.value.reviewPriceFen : undefined;
  const parsed = submissionResult.value;
  if (!parsed.success && !recoverableJobId.value) {
    attempted.value = true;
    scrollToField(String(parsed.error.issues[0].path[0]));
    return;
  }
  if (exampleFilled.value && !recoverableJobId.value) {
    confirmingExample.value = true;
    const confirmed = await confirmAction('使用虚构资料进行真实评审？', `这将调用真实 AI${paymentsEnabled.value ? `，并消耗 1 次额度或支付 ${priceLabel.value}` : ''}。仅了解报告可点击“免费查看示例报告”。`, '真实评审', '先不评审');
    confirmingExample.value = false;
    if (!confirmed) return;
  }
  if (serviceState.value !== 'ready' && !recoverableJobId.value) {
    error.value = '真实 AI 服务暂不可用，请稍后重连，或先查看免费示例。';
    return;
  }
  busy.value = true;
  phase.value = 'checking';
  completed.value = 0;
  const generation = ++operation;
  let jobId = '';
  let terminal = false;
  try {
    let recoveredJob = recoverableJobId.value;
    if (!recoveredJob) {
      const selection = selectedPanel();
      const key = panelKey.value;
      if (!selection) throw new Error('请先选满三种不同评审偏好。');
      const previous = currentOffer.value;
      let config: ReviewOffer;
      try { config = parseReviewOffer(await getConfig(selection)); }
      catch (cause) {
        currentOffer.value = undefined;
        serviceState.value = 'error';
        throw cause;
      }
      if (generation !== operation) return;
      if (key !== panelKey.value) throw new Error('评审阵容已改变，请重新确认后再提交。');
      paymentsEnabled.value = config.paymentsEnabled;
      currentOffer.value = config;
      serviceState.value = config.liveAvailable ? 'ready' : 'unavailable';
      if (previous && (previous.reviewPriceFen !== config.reviewPriceFen || previous.paymentsEnabled !== config.paymentsEnabled)) {
        notice.value = '价格已更新，请重新确认本次评审';
        return;
      }
      if (!config.liveAvailable)
        throw new Error('当前行业、轮次与偏好的 AI 评审暂不可用，本次不会发起付款。请先查看免费示例。');
      if (config.paymentsEnabled && !billing.value) {
        await refreshBilling();
        notice.value = billingError.value ? '' : '订单与额度已确认，请检查本次消耗后再次点击下方按钮。';
        return;
      }
      if (config.paymentsEnabled) {
        billing.value = await ensureReviewCredit({
          purchase: purchasePrice === undefined ? undefined : { priceFen: purchasePrice },
          status: async () => { const status = await getBillingStatus(); billing.value = status; rememberBilling(status); return status; },
          query: async (id) => { const result = await queryPaymentOrder(id); billing.value = result.billing; rememberBilling(result.billing); return result; },
          create: createPaymentOrder,
          pay: async (params) => {
            if (generation !== operation) throw new Error('已停止等待，请先查询已有订单与额度');
            phase.value = 'payment';
            try { await payWithWechat(params); }
            finally { phase.value = 'confirming'; }
          },
          sleep: () => new Promise((resolve) => setTimeout(resolve, 1200)),
          stopped: () => generation !== operation,
        });
        rememberBilling(billing.value);
        recoveredJob = billing.value.recoverableJobId || '';
      }
    }
    if (generation !== operation) return;
    const requestKey = `review_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    if (!recoveredJob && !parsed.success) throw new Error('请先填写项目资料');
    resumingJob.value = Boolean(recoveredJob);
    phase.value = 'starting';
    const job = recoveredJob
      ? await pollEvaluation(recoveredJob)
      : await startReview(parsed.data!, requestKey);
    jobId = job.id;
    pendingJobId.value = jobId;
    if (generation !== operation) {
      if (paymentsEnabled.value) void refreshBilling();
      return;
    }
    completed.value = job.completedInvestors;
    phase.value = 'reviewing';
    if (job.status === 'done' && job.report) {
      busy.value = false;
      pendingJobId.value = '';
      clearRecoverable();
      terminal = true;
      openReport(job.report);
      return;
    }
    if (job.status === 'failed') {
      terminal = true;
      throw new Error(job.error?.message || '评估未完成，额度已恢复');
    }
    // Allow the server's bounded five-minute model timeout plus polling overhead.
    const deadline = Date.now() + 330000;
    let failures = 0;
    while (generation === operation && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      if (generation !== operation) return;
      let result;
      try {
        result = await pollEvaluation(jobId);
        failures = 0;
      } catch (cause) {
        if (++failures >= 3) throw cause;
        continue;
      }
      if (generation !== operation) return;
      completed.value = result.completedInvestors;
      if (result.status === 'failed') {
        terminal = true;
        throw new Error(result.error?.message || '评估失败，请重试');
      }
      if (result.status === 'done' && result.report) {
        busy.value = false;
        pendingJobId.value = '';
        clearRecoverable();
        terminal = true;
        openReport(result.report);
        return;
      }
    }
    if (generation === operation)
      throw new Error('等待时间较长，评审仍可能进行中。请点击“继续已有评审”查询，本次不会重新付款。');
  } catch (cause) {
    if (generation === operation) {
      error.value = cause instanceof Error ? cause.message : '评审未完成，请重试';
      if (error.value.includes('价格已更新')) void loadConfig();
    }
    if (cause instanceof ApiFailure && cause.code === 'REPORT_NOT_FOUND') terminal = true;
    if (terminal) { pendingJobId.value = ''; clearRecoverable(); }
  } finally {
    if (generation === operation) {
      busy.value = false;
      if (terminal) {
        clearRecoverable();
        if (billing.value) billing.value = { ...billing.value, recoverableJobId: undefined };
      } else if (paymentsEnabled.value && phase.value !== 'checking') void refreshBilling();
    }
    if (jobId && terminal) {
      // Forget the claimed task before refreshing the account, so it cannot become a
      // stale recovery blocker while a report opens its new-review entry.
      void deleteEvaluation(jobId).then(() => {
        if (!pageUnloaded && paymentsEnabled.value) void refreshBilling();
      }).catch(() => undefined);
    }
  }
}
</script>

<template>
  <view class="page pitch-page">
    <PageHeader />
    <view class="pitch-heading">
      <text class="eyebrow">开始一场模拟评审</text>
      <view class="pitch-title">说清项目，<br />准备好下一轮追问。</view>
      <text class="caption">写下项目现状，三位虚构 AI 教练帮你找出下一步要回答的问题。</text>
    </view>

    <view class="sample-card">
      <view><text class="sample-title">先看看，会得到什么</text><text class="sample-caption">固定虚构案例 · 无需填写 · 不调用 AI · 不收费</text></view>
      <button class="sample-button" :disabled="busy || uploading" @click="demo">免费示例 ↗</button>
    </view>
    <view class="service-status" :class="{ unavailable: serviceState !== 'ready' }" role="status">
      <view class="service-dot" /><text>{{ availability }}</text>
      <button v-if="serviceState === 'error' || serviceState === 'unavailable'" class="reconnect-button" :disabled="configLoading" @click="loadConfig">重新连接</button>
    </view>
    <view v-if="notice" class="notice form-notice" role="status">{{ notice }}</view>
    <view v-if="draftRestored" class="draft-card">
      <view class="draft-heading"><text>已恢复上次填写的项目资料</text><button class="draft-reset" :disabled="busy || uploading || confirmingExample || configLoading || checkingOrders || Boolean(recoverableJobId)" @click="clearDraft">清空重填</button></view>
      <text>{{ recoverableJobId ? '请先继续已有评审并领取报告，暂不能清空本次项目资料。' : '草稿仅在当前会话中临时保留，请检查后继续；开始新项目可清空重填。' }}</text>
    </view>
    <view v-if="recoverableJobId && !busy" class="recovery-card">
      <view class="recovery-title">有一份评审可以继续</view>
      <text>直接查询原评审进度或领取报告，无需重新填写或再次付款。</text>
      <button class="secondary" :disabled="checkingOrders" @click="submit">继续已有评审 →</button>
    </view>

    <view class="form-section">
      <view class="form-section-heading"><text class="section-number">01</text><view><view class="form-section-title">说说你的项目</view><text class="section-description">只需名称与 30 字以上介绍，就可以开始。</text></view></view>
      <view id="field-projectName" class="field-group">
        <view class="field-label"><text>项目名称 <text class="required-label">必填</text></text><text class="field-counter">{{ projectName.length }}/32</text></view>
        <input v-model="projectName" class="text-input" :class="{ invalid: fieldErrors.projectName }" placeholder="例如：帮小店做会员运营的工具" :maxlength="32" aria-label="项目名称，必填，最多32字" :aria-invalid="Boolean(fieldErrors.projectName)" @input="exampleFilled = false" />
        <text v-if="fieldErrors.projectName" class="field-error" role="alert">{{ fieldErrors.projectName }}</text>
      </view>
      <view id="field-description" class="field-group">
        <view class="field-label"><text>项目介绍 <text class="required-label">必填</text></text><button class="text-link" :disabled="uploading" @click="fillExample">填入虚构示例</button></view>
        <view class="description-guide"><text>服务谁</text><text>解决什么问题</text><text>怎么赚钱</text><text>验证了什么</text></view>
        <textarea v-model="description" class="description-input" :class="{ invalid: fieldErrors.description }" placeholder="我们为……提供……，通过……收费。目前已经……。有数据就说数据，还没验证也可以坦诚说明。" :maxlength="3000" :auto-height="false" aria-label="项目介绍，必填，30至3000字" :aria-invalid="Boolean(fieldErrors.description)" @input="exampleFilled = false" />
        <view class="input-footer"><text :class="{ 'counter-short': description.trim().length > 0 && description.trim().length < 30 }">{{ description.trim().length < 30 ? `至少 30 字，还差 ${30 - description.trim().length} 字` : '介绍已达最低字数，可继续补充事实' }}</text><text>{{ description.length }}/3000</text></view>
        <text v-if="fieldErrors.description" class="field-error" role="alert">{{ fieldErrors.description }}</text>
      </view>
      <view v-if="exampleFilled" class="example-notice"><text>当前填写的是虚构示例，真实 AI 评审仍按页面规则计费。</text><button class="text-link" @click="demo">只看免费示例 →</button></view>
    </view>

    <view class="form-section settings-section">
      <button class="settings-summary" :aria-expanded="settingsExpanded" @click="settingsExpanded = !settingsExpanded">
        <view><view class="form-section-title">02 / {{ panelReady ? '已配好三种评审视角' : `已选 ${preferences.length} / 3 种，请补全` }}</view><text>{{ settingsSummary }}</text><text>{{ preferenceSummary || '请选择三种评审偏好' }}</text><text class="settings-edit">调整行业、轮次与教练 {{ settingsExpanded ? '−' : '+' }}</text></view>
      </button>
      <view v-if="settingsExpanded" class="settings-expanded">
      <view id="field-industry" class="field-group">
        <view class="field-label"><text>项目所属行业</text><text class="field-hint">选择最接近的一项</text></view>
        <view class="industry-choices"><button v-for="item in INDUSTRIES" :key="item.id" class="industry-choice" :class="{ selected: industry === item.id }" :aria-pressed="industry === item.id" @click="industry = item.id"><text>{{ item.icon }}</text> {{ item.shortName }}</button></view>
      </view>
      <view id="field-round" class="field-group">
        <view class="field-label"><text>目标融资轮次</text><text class="field-hint">决定追问侧重点</text></view>
        <view class="round-choices"><button v-for="item in FUNDING_ROUNDS" :key="item.id" class="round-choice" :class="{ selected: round === item.id }" :aria-pressed="round === item.id" @click="round = item.id">{{ item.name }}</button></view>
        <view class="round-focus"><text class="round-focus-label">{{ currentRound.name }}会重点问</text><text>{{ currentRound.question }}</text></view>
      </view>
      <view id="field-stage" class="field-group"><view class="field-label">项目目前走到哪一步</view><picker :range="STAGES" :value="STAGES.indexOf(stage)" aria-label="选择项目阶段" @change="setStage"><view class="stage-picker"><text>{{ stage }}</text><text class="muted">更改 ⌄</text></view></picker></view>
      <view id="field-tone" class="field-group"><view class="field-label">希望怎样收到反馈</view><view class="tone-options"><button class="tone-card" :class="{ selected: tone === 'sharp' }" :aria-pressed="tone === 'sharp'" @click="tone = 'sharp'"><view class="tone-top"><text>✳ 犀利版</text><view class="radio-dot" /></view><text class="tone-description">直说问题，追问商业逻辑</text></button><button class="tone-card" :class="{ selected: tone === 'balanced' }" :aria-pressed="tone === 'balanced'" @click="tone = 'balanced'"><view class="tone-top"><text>◈ 专业版</text><view class="radio-dot" /></view><text class="tone-description">冷静拆解，给出改进建议</text></button></view></view>
      <view id="field-preferences" class="assigned-panel">
        <view class="assigned-label"><text>本次 AI 评审阵容</text><text>{{ currentIndustry.shortName }} · {{ currentRound.name }}</text></view>
        <view class="panel-people"><view v-for="person in panel" :key="person.id" class="panel-person"><InvestorAvatar :investor="person" small /><view class="panel-person-copy"><text class="panel-name">{{ person.name }}</text><text class="panel-title">{{ person.title }}</text></view><text class="panel-type">虚构 AI</text></view></view>
        <button class="panel-customize" :aria-expanded="preferenceEditor" @click="preferenceEditor = !preferenceEditor"><text>已选 {{ preferences.length }} / {{ PANEL_SIZE }} 位 · 更换评审偏好</text><text>{{ preferenceEditor ? '收起 −' : '展开 +' }}</text></button>
        <view v-if="preferenceEditor" class="preference-editor">
          <text class="caption">每种偏好对应一位教练。先取消已选项，再补选，保持三种不同偏好。</text>
          <view class="preference-choices"><button v-for="item in PREFERENCES" :key="item.id" :class="{ selected: preferences.includes(item.id) }" :aria-pressed="preferences.includes(item.id)" @click="togglePreference(item.id)">{{ preferences.includes(item.id) ? '✓ ' : '' }}{{ item.name }}</button></view>
          <text v-if="preferenceError || !panelReady || fieldErrors.preferences" class="preference-hint" role="alert">{{ preferenceError || fieldErrors.preferences || '请补选至三位教练，或恢复推荐阵容。' }}</text>
          <button class="restore-panel" @click="preferences = [...DEFAULT_PREFERENCES]; preferenceError = ''">恢复推荐的三人阵容</button>
        </view>
        <button class="panel-directory" @click="uni.navigateTo({ url: `/pages/investors/index?industry=${industry}&round=${round}` })">认识全部 {{ PREFERENCES.length }} 位教练 →</button>
      </view>
    </view>
      </view>

    <view class="form-section">
      <view class="form-section-heading"><text class="section-number">03</text><view><view class="form-section-title">资料与授权</view><text class="section-description">BP 选填；上传与真实评审前需要你的授权。</text></view></view>
      <view id="field-consent" class="consent-card" :class="{ invalid: fieldErrors.consent }">
        <button class="consent-row" role="checkbox" :aria-checked="consent" @click="toggleConsent"><view class="checkbox" :class="{ checked: consent }">{{ consent ? '✓' : '' }}</view><text>我同意将本次资料用于文字提取，并发送给 DeepSeek 进行评审。报告保存在本机，不会自动公开。请勿提交无权使用的资料。</text></button>
        <button class="privacy-link" @click="uni.navigateTo({ url: aboutPath('privacy') })">查看资料处理与隐私说明 →</button>
        <button class="privacy-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=ai' })">DeepSeek 资料处理与撤回同意 →</button>
        <button class="privacy-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=terms' })">使用须知 →</button>
        <text v-if="fieldErrors.consent" class="field-error" role="alert">请先阅读并勾选资料处理授权。</text>
      </view>
      <view id="field-bpText" class="field-group">
        <view class="field-label"><text>补充商业计划书</text><text class="field-hint">选填，不上传也能评审</text></view>
        <button class="upload-box" :disabled="uploading || busy" @click="upload"><view class="upload-icon">{{ uploading ? '◌' : '↥' }}</view><view class="upload-copy"><text class="upload-title">{{ uploading ? '正在选择文件或提取文字…' : filename || '选择一份 BP 文件' }}</text><text class="upload-description">PDF / PPTX / DOCX / TXT / MD · 最大 10 MB</text></view><text class="upload-plus">{{ filename ? '↻' : '+' }}</text></button>
        <text class="upload-help">仅提取文字，扫描图片请先转成文字。新文件会替换现有正文。</text>
        <text v-if="uploadError" class="field-error" role="alert">{{ uploadError }}</text>
        <text v-if="uploadNotice" class="upload-notice" role="status">{{ uploadNotice }}</text>
        <button class="paste-toggle" :aria-expanded="expandedBP" @click="expandedBP = !expandedBP"><text>{{ expandedBP ? '收起补充正文' : '也可以直接粘贴文字' }}</text><text>{{ expandedBP ? '−' : '+' }}</text></button>
        <view v-if="expandedBP"><textarea v-model="bpText" class="bp-input" :disabled="uploading" placeholder="目标客户、市场、竞争、收入与成本、团队、融资用途……提供已有的信息即可。" :maxlength="50000" aria-label="补充项目资料，选填，最多50000字" @input="exampleFilled = false" /><text class="bp-count">{{ bpText.length.toLocaleString() }}/50,000 字 · 可编辑</text></view>
        <text v-if="fieldErrors.bpText" class="field-error" role="alert">{{ fieldErrors.bpText }}</text>
      </view>
    </view>

    <view class="submission-section">
      <view class="billing-card">
        <view class="delivery-heading">本次会得到什么</view>
        <view class="delivery-list"><text>八个维度的项目分析与证据缺口</text><text>风险、模拟追问与优先改进清单</text><text>向三位专项AI教练发起请求，按实际完成展示</text></view>
        <view class="billing-heading"><ReviewOfferStatus :state="offerState" :offer="currentOffer" /><text v-if="billing" class="credit-pill">可用 {{ billing.credits }} 次</text></view>
        <text v-if="paymentsEnabled && !billing" class="billing-rule">尚未查询本人的额度；确认时先查账户，有额度优先使用。</text>
        <text class="billing-rule">至少一位教练生成报告即计1次；全部失败恢复本次额度。暂时退出不会中断评审，未使用额度会保留。未使用额度退款由人工处理。</text>
        <view v-if="billing?.orders.some(order => order.status === 'pending')" class="pending-payment">有待确认订单。若已扣款，请先查询额度，勿重复付款。</view>
        <button class="billing-query" :disabled="busy || checkingOrders" @click="refreshBilling">{{ checkingOrders ? '正在查询订单与额度…' : '查询订单与额度 ↻' }}</button>
        <text v-if="billingError" class="field-error" role="alert">{{ billingError }}</text>
        <button v-if="billing?.supportContact || currentOffer?.supportContact" class="billing-query" @click="uni.setClipboardData({ data: billing?.supportContact || currentOffer?.supportContact || '' })">复制客服联系信息</button><text v-if="billing?.supportContact || currentOffer?.supportContact" class="billing-support">{{ billing?.supportContact || currentOffer?.supportContact }}</text><text v-else class="billing-support">暂未取得客服联系信息，可在说明页重新获取。</text>
        <button v-if="billing?.orders.length" class="orders-toggle" :aria-expanded="ordersExpanded" @click="ordersExpanded = !ordersExpanded">{{ ordersExpanded ? '收起' : '查看' }}最近订单 {{ ordersExpanded ? '−' : '+' }}</button>
        <view v-if="ordersExpanded"><view v-for="order in billing?.orders.slice(0, 5)" :key="order.id" class="billing-order"><text>{{ orderLabels[order.status] || order.status }} · {{ order.id.slice(-8) }}</text><button class="order-copy" @click="uni.setClipboardData({ data: order.id })">复制订单号</button></view></view>
        <view class="checkout-faq"><button @click="uni.navigateTo({ url: aboutPath('orders') })">已扣款但没有报告？ →</button><button @click="uni.navigateTo({ url: aboutPath('refund') })">计次与退款说明 →</button></view>
      </view>
      <view v-if="error" class="error-box" role="alert">{{ error }}</view>
      <text v-if="attempted && !submissionResult.success && !recoverableJobId" class="field-error form-errors" role="alert">请完善上方标注的项目资料与授权。填写错误不会发起付款。</text>
      <button class="primary lime submit-button" :disabled="busy || uploading || confirmingExample || checkingOrders || (!recoverableJobId && configLoading) || (!recoverableJobId && serviceState !== 'ready')" @click="submit"><text>{{ confirmingExample ? '请确认示例资料用途…' : paymentLabel }}</text><text>↗</text></button>
      <text class="submit-footnote">{{ recoverableJobId ? '查询的是已有评审，不会创建新的付费订单。' : '真实 AI 评审通常需要 30–90 秒，结果仅供路演练习参考。' }}</text>
      <button class="demo-link" :disabled="busy || uploading" @click="demo">免费查看示例报告 →</button>
    </view>
    <BottomNav active="pitch" />

    <view v-if="busy" class="loading-overlay" role="dialog" aria-modal="true" aria-label="评审进行中">
      <view class="loading-card"><view class="loading-orb">✳</view><text class="eyebrow">AI投了么 · 真实评审</text><view class="loading-title">{{ busyTitle }}</view><text class="loading-description" role="status">{{ busyDescription }}</text>
        <view v-if="phase === 'reviewing'"><view v-if="!resumingJob" class="loading-people"><InvestorAvatar v-for="person in panel" :key="person.id" :investor="person" /></view><view class="progress-track"><view class="progress-fill" :style="{ width: `${(completed / PANEL_SIZE) * 100}%` }" /></view><text class="loading-footnote">通常需要 30–90 秒，完成后自动打开报告。</text></view>
        <text v-else class="loading-footnote">{{ phase === 'starting' ? '正在确认提交结果，请留在本页，避免重复提交。' : paymentsEnabled ? '先确认已有订单与额度，再开始真实评审。' : '正在检查评审服务，请稍候。' }}</text>
        <button class="secondary pause-button" :disabled="cancelling || phase === 'starting'" @click="pause">{{ phase === 'starting' ? '正在确认提交，请稍候…' : pendingJobId ? '返回填写页，评审继续' : '暂时返回填写页' }}</button>
        <button v-if="pendingJobId && !paymentsEnabled && !resumingJob" class="cancel-button" :disabled="cancelling" @click="cancel">{{ cancelling ? '正在确认取消…' : '取消本次评审' }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.pitch-page .pitch-heading { margin: 5px 0 22px; }
.pitch-page .pitch-heading .eyebrow { color: #2f684e; letter-spacing: 1px; font-size: 12px; }
.pitch-page .pitch-title { font-size: 27px; line-height: 1.4; font-weight: 800; letter-spacing: -.6px; margin: 11px 0 12px; }
.pitch-page .pitch-heading .caption { font-size: 13px; color: #647068; }
.pitch-page .sample-card { display: flex; align-items: center; gap: 12px; padding: 15px; background: #eaf0de; border: 1px solid #dbe5c9; border-radius: 15px; }
.pitch-page .sample-card > view { flex: 1; min-width: 0; }
.pitch-page .sample-title { display: block; font-size: 14px; font-weight: 700; }
.pitch-page .sample-caption { display: block; margin-top: 5px; color: #5c6d55; font-size: 12px; line-height: 1.7; }
.pitch-page .sample-button { min-height: 44px; flex-shrink: 0; padding: 11px 0 11px 6px; color: #2f684e; font-size: 13px; font-weight: 700; }
.pitch-page .service-status { display: flex; gap: 7px; align-items: center; min-height: 44px; margin-top: 9px; color: #4c6955; font-size: 12px; line-height: 1.7; }
.pitch-page .service-status.unavailable { color: #786843; }
.pitch-page .service-status > text { flex: 1; }
.pitch-page .service-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: #2f684e; }
.pitch-page .unavailable .service-dot { background: #a18c59; }
.pitch-page .reconnect-button { min-height: 44px; padding: 10px 0 10px 8px; font-size: 12px; color: #2f684e; flex-shrink: 0; }
.pitch-page .form-notice { margin: 12px 0; font-size: 13px; }
.pitch-page .draft-card { padding: 13px 15px; border: 1px solid #d9e2cd; border-radius: 13px; background: #f0f4e7; margin: 14px 0; }
.pitch-page .draft-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 700; color: #3f5b3f; }
.pitch-page .draft-reset { flex-shrink: 0; min-height: 44px; padding: 10px 0 10px 6px; color: #2f684e; font-size: 12px; font-weight: 500; }
.pitch-page .draft-card > text { display: block; font-size: 12px; color: #647358; line-height: 1.8; }
.pitch-page .recovery-card { padding: 18px; border: 1px solid #b5c797; border-radius: 16px; background: #edf3e3; margin: 15px 0; }
.pitch-page .recovery-title { font-size: 16px; font-weight: 700; }
.pitch-page .recovery-card > text { display: block; font-size: 13px; color: #56694d; margin: 7px 0 13px; line-height: 1.8; }
.pitch-page .recovery-card .secondary { color: #2f684e; background: white; }
.pitch-page .form-section { padding: 26px 0 4px; border-top: 1px solid #e0e5d8; margin-top: 20px; }
.pitch-page .form-section-heading { display: flex; align-items: flex-start; gap: 11px; margin-bottom: 22px; }
.pitch-page .section-number { display: flex; align-items: center; justify-content: center; width: 29px; height: 29px; border-radius: 9px; background: #e5ebd8; color: #2f684e; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
.pitch-page .form-section-title { font-size: 18px; font-weight: 750; }
.pitch-page .section-description { display: block; font-size: 12px; line-height: 1.8; color: #697466; margin-top: 3px; }
.pitch-page .field-group { margin-bottom: 23px; scroll-margin-top: 24px; }
.pitch-page .field-label { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.pitch-page .field-counter, .pitch-page .field-hint { color: #6d7867; font-weight: 400; font-size: 12px; }
.pitch-page .required-label { display: inline; font-size: 12px; color: #64765a; font-weight: 400; margin-left: 5px; }
.pitch-page .text-input, .pitch-page .stage-picker { background: white; border: 1px solid #d6decd; padding: 14px; border-radius: 12px; height: 52px; font-size: 14px; }
.pitch-page .text-input { width: 100%; }
.pitch-page .stage-picker { display: flex; align-items: center; justify-content: space-between; }
.pitch-page .stage-picker .muted { font-size: 12px; }
.pitch-page .description-guide { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.pitch-page .description-guide text { font-size: 12px; color: #627456; background: #edf1e5; padding: 4px 7px; border-radius: 6px; }
.pitch-page .description-input, .pitch-page .bp-input { width: 100%; height: 180px; font-size: 14px; line-height: 1.9; padding: 14px; background: white; border: 1px solid #d6decd; border-radius: 12px; }
.pitch-page .bp-input { margin-top: 10px; height: 220px; }
.pitch-page .invalid { border-color: #bc684a; background: #fffaf6; }
.pitch-page .input-footer { display: flex; align-items: start; justify-content: space-between; gap: 10px; margin-top: 8px; color: #737d69; font-size: 12px; }
.pitch-page .input-footer > text:last-child { flex-shrink: 0; }
.pitch-page .counter-short { color: #966135; }
.pitch-page .field-error { display: block; margin-top: 8px; color: #a24c30; font-size: 13px; line-height: 1.8; }
.pitch-page .text-link { font-size: 12px; font-weight: 500; color: #2f684e; min-height: 44px; padding: 10px 0 10px 8px; text-align: right; }
.pitch-page .example-notice { background: #fff1dc; border-radius: 11px; padding: 12px; color: #855e2d; font-size: 12px; line-height: 1.8; margin-bottom: 17px; }
.pitch-page .example-notice .text-link { padding: 9px 0 0; text-align: left; }
.pitch-page .industry-choices { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.pitch-page .industry-choice { border: 1px solid #d9e0d0; border-radius: 10px; min-height: 46px; padding: 10px 2px; background: #fcfcf8; font-size: 12px; color: #5e6c55; }
.pitch-page .industry-choice.selected, .pitch-page .round-choice.selected { background: #e4edcf; border-color: #799858; color: #304d2c; font-weight: 700; }
.pitch-page .round-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.pitch-page .round-choice { min-height: 46px; padding: 11px 3px; background: #fcfcf8; border: 1px solid #d9e0d0; border-radius: 10px; color: #5e6c55; font-size: 12px; }
.pitch-page .round-focus { display: flex; flex-direction: column; gap: 4px; padding: 12px; margin-top: 10px; border-radius: 10px; background: #edf2e4; font-size: 13px; color: #536b46; line-height: 1.8; }
.pitch-page .round-focus-label { font-size: 12px; color: #6c7e5e; }
.pitch-page .tone-options { display: flex; gap: 10px; }
.pitch-page .tone-card { flex: 1; border: 1px solid #d9e0d0; border-radius: 12px; padding: 13px 11px; background: #fcfcf8; text-align: left; }
.pitch-page .tone-card.selected { background: #e7eed9; border-color: #799858; }
.pitch-page .tone-top { display: flex; align-items: center; justify-content: space-between; gap: 5px; font-size: 14px; font-weight: 700; }
.pitch-page .radio-dot { border: 1px solid #bcc9aa; width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.pitch-page .selected .radio-dot { border: 4px solid #2f684e; background: white; }
.pitch-page .tone-description { display: block; font-size: 12px; line-height: 1.8; color: #65765a; margin-top: 7px; }
.pitch-page .assigned-panel { padding: 16px; border-radius: 15px; background: #edf1e5; margin: 8px 0 18px; }
.pitch-page .assigned-label { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #607153; margin-bottom: 12px; }
.pitch-page .assigned-label > text:first-child { color: #354e35; font-weight: 700; }
.pitch-page .panel-people { display: flex; flex-direction: column; gap: 14px; }
.pitch-page .panel-person { display: flex; align-items: center; gap: 11px; }
.pitch-page .panel-person-copy { flex: 1; min-width: 0; }
.pitch-page .panel-name { display: block; font-size: 14px; font-weight: 700; }
.pitch-page .panel-title { display: block; color: #66785a; font-size: 12px; line-height: 1.8; margin-top: 2px; }
.pitch-page .panel-type { font-size: 12px; color: #65765b; border: 1px solid #ced9bc; border-radius: 5px; padding: 2px 5px; flex-shrink: 0; }
.pitch-page .panel-customize { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 48px; font-size: 12px; color: #2f684e; margin-top: 15px; padding-top: 10px; border-top: 1px solid #d6dfca; text-align: left; }
.pitch-page .panel-customize > text:last-child { flex-shrink: 0; }
.pitch-page .preference-editor { padding-top: 10px; }
.pitch-page .preference-editor .caption { font-size: 12px; color: #637258; }
.pitch-page .preference-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 10px; }
.pitch-page .preference-choices button { padding: 11px 2px; min-height: 44px; font-size: 12px; color: #5b6c50; border: 1px solid #cdd8bc; border-radius: 8px; background: #f9fbf4; }
.pitch-page .preference-choices button.selected { background: #dce8c3; color: #304d2c; border-color: #799858; font-weight: 700; }
.pitch-page .preference-hint { display: block; margin-top: 10px; font-size: 12px; line-height: 1.8; color: #9a6030; }
.pitch-page .restore-panel, .pitch-page .panel-directory { min-height: 44px; padding: 11px 0; font-size: 12px; color: #2f684e; text-align: left; }
.pitch-page .panel-directory { margin-top: 3px; }
.pitch-page .consent-card { background: white; border: 1px solid #dce3d3; border-radius: 12px; padding: 14px; margin-bottom: 20px; scroll-margin-top: 24px; }
.pitch-page .consent-card.invalid { border-color: #bc684a; }
.pitch-page .consent-row { display: flex; align-items: flex-start; gap: 10px; text-align: left; font-size: 13px; line-height: 1.9; color: #59664e; width: 100%; min-height: 44px; }
.pitch-page .checkbox { display: flex; justify-content: center; align-items: center; width: 20px; height: 20px; border: 1px solid #a5b78f; border-radius: 5px; flex-shrink: 0; margin-top: 2px; font-size: 13px; }
.pitch-page .checkbox.checked { background: #2f684e; color: white; border-color: #2f684e; }
.pitch-page .privacy-link { color: #2f684e; font-size: 12px; min-height: 44px; padding: 12px 0 6px 30px; text-align: left; }
.pitch-page .upload-box { display: flex; align-items: center; gap: 10px; border: 1px dashed #a9bc8c; border-radius: 12px; background: #f0f4e7; padding: 17px 12px; width: 100%; text-align: left; }
.pitch-page .upload-icon { font-size: 27px; color: #6e8b51; flex-shrink: 0; }
.pitch-page .upload-copy { flex: 1; min-width: 0; }
.pitch-page .upload-title { display: block; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; word-break: break-all; }
.pitch-page .upload-description { display: block; color: #657559; font-size: 12px; line-height: 1.9; margin-top: 4px; }
.pitch-page .upload-plus { flex-shrink: 0; font-size: 21px; color: #738b58; }
.pitch-page .upload-help { display: block; margin-top: 9px; color: #737c69; font-size: 12px; line-height: 1.8; }
.pitch-page .upload-notice { display: block; margin-top: 9px; font-size: 12px; line-height: 1.8; color: #506d40; }
.pitch-page .paste-toggle { display: flex; align-items: center; width: 100%; justify-content: space-between; min-height: 46px; padding: 12px 0; font-size: 13px; color: #2f684e; }
.pitch-page .bp-count { display: block; text-align: right; margin-top: 7px; font-size: 12px; color: #6d7c60; }
.pitch-page .submission-section { padding-top: 4px; }
.pitch-page .billing-card { margin: 4px 0 20px; padding: 18px; background: #e9efdc; border: 1px solid #d8e3c5; border-radius: 15px; }
.pitch-page .billing-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pitch-page .billing-eyebrow { font-size: 12px; color: #617851; }
.pitch-page .billing-price { font-size: 28px; font-weight: 800; color: #294834; margin-top: 3px; }
.pitch-page .billing-price > text { font-size: 12px; font-weight: 400; color: #6c7a5d; }
.pitch-page .credit-pill { font-size: 12px; padding: 5px 9px; border-radius: 20px; color: #2f684e; background: #fffefa; }
.pitch-page .billing-rule { display: block; margin-top: 12px; color: #596f4b; font-size: 12px; line-height: 1.9; }
.pitch-page .pending-payment { color: #895d2b; background: #fff5df; border-radius: 8px; padding: 10px; margin-top: 12px; font-size: 12px; line-height: 1.8; }
.pitch-page .billing-query { color: #2f684e; font-size: 13px; font-weight: 600; min-height: 44px; padding: 12px 0 7px; text-align: left; }
.pitch-page .billing-support { display: block; font-size: 12px; color: #627454; line-height: 1.8; overflow-wrap: anywhere; }
.pitch-page .orders-toggle { font-size: 12px; color: #49623e; width: 100%; min-height: 44px; padding: 10px 0 0; text-align: left; }
.pitch-page .billing-order { display: flex; align-items: center; justify-content: space-between; gap: 5px; border-top: 1px solid #d4dfc3; font-size: 12px; color: #5d6c50; }
.pitch-page .order-copy { min-height: 44px; padding: 11px 0 11px 8px; color: #2f684e; font-size: 12px; }
.pitch-page .form-errors { margin-bottom: 13px; }
.pitch-page .submit-button { font-size: 15px; }
.pitch-page .submit-footnote { display: block; text-align: center; margin-top: 12px; color: #6b7662; font-size: 12px; line-height: 1.8; }
.pitch-page .demo-link { display: block; margin: 10px auto 0; min-height: 46px; font-size: 13px; color: #2f684e; padding: 12px 0; }
.pitch-page .loading-overlay { position: fixed; inset: 0; background: #18281fba; display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 99; }
.pitch-page .loading-card { width: 100%; max-width: 360px; max-height: 88vh; overflow-y: auto; background: #f7f8f0; border-radius: 23px; padding: 27px 22px 17px; text-align: center; }
.pitch-page .loading-orb { font-size: 52px; color: #6f934b; margin-bottom: 12px; animation: rotate 7s linear infinite; }
.pitch-page .loading-card .eyebrow { color: #68785b; font-size: 12px; letter-spacing: 1px; }
.pitch-page .loading-title { font-size: 22px; line-height: 1.5; font-weight: 800; margin: 12px 0; }
.pitch-page .loading-description { display: block; font-size: 13px; line-height: 1.9; color: #596a50; }
.pitch-page .loading-people { display: flex; justify-content: center; gap: 12px; margin: 23px 0; }
.pitch-page .progress-track { height: 6px; background: #dfe7d1; border-radius: 3px; overflow: hidden; }
.pitch-page .progress-fill { height: 6px; background: #70954b; transition: width .5s; }
.pitch-page .loading-footnote { display: block; color: #6c795e; font-size: 12px; line-height: 1.8; margin-top: 15px; }
.pitch-page .pause-button { margin-top: 22px; font-size: 13px; color: #2f684e; background: white; border-color: #cdd9bb; }
.pitch-page .cancel-button { font-size: 12px; color: #7d6349; margin-top: 5px; min-height: 44px; padding: 12px; }
@keyframes rotate { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pitch-page .loading-orb { animation: none; } .pitch-page .progress-fill { transition: none; } }
@media (max-width: 360px) { .pitch-page .pitch-title { font-size: 27px; } .pitch-page .industry-choices { grid-template-columns: repeat(3, 1fr); } .pitch-page .field-hint { font-size: 12px; } .pitch-page .tone-description { font-size: 12px; } }
.pitch-page .settings-summary { text-align: left; width: 100%; min-height: 110px; padding: 16px; border: 1px solid #dfe5d7; border-radius: 16px; background: #edf1e5; }
.pitch-page .settings-summary text { display: block; font-size: 12px; color: #626d64; line-height: 1.75; margin-top: 6px; }
.pitch-page .settings-summary .settings-edit { color: #2f684e; padding: 8px 0 0; }
.pitch-page .settings-expanded { margin-top: 24px; }
.pitch-page .delivery-heading { font-size: 18px; font-weight: 750; }
.pitch-page .delivery-list { margin: 12px 0 20px; border-bottom: 1px solid #d3ddc4; padding-bottom: 16px; }
.pitch-page .delivery-list text { display: block; font-size: 13px; line-height: 1.85; margin-top: 6px; }
.pitch-page .delivery-list text::before { content: '✓ '; color: #2f684e; }
.pitch-page .checkout-faq { border-top: 1px solid #d3ddc4; margin-top: 14px; }
.pitch-page .checkout-faq button { display: block; min-height: 44px; width: 100%; text-align: left; color: #2f684e; font-size: 12px; padding: 10px 0; }
</style>
