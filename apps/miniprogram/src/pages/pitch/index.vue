<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onBackPress, onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
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
import { clearRecoverable, getDraftEpoch, getKnownRecoverable, getPitchDraft, savePitchDraft, getStartingEvaluation, setStartingEvaluation, rememberBilling, takeEntryNotice } from '@/lib/review-entry';
import type { PitchDraft } from '@/lib/review-entry';
import { randomPanelPreferences, togglePanelPreference } from '@/lib/investor-selection';
import { PITCH_STEPS as STEPS, usePitchWizard } from '@/lib/pitch-wizard';
import { hasAIDataConsent, setAIDataConsent } from '@/lib/privacy';
const memoryDraft = getPitchDraft();
const draftEpoch = getDraftEpoch();

const inheritedStart = getStartingEvaluation();
const referralProjectId = ref<string>();
const projectName = ref(memoryDraft?.projectName || '');
const industry = ref<IndustryId>(memoryDraft?.industry || 'ai');
const round = ref<RoundId>(memoryDraft?.round || 'angel');
const preferences = ref<PreferenceId[]>(memoryDraft ? [...memoryDraft.preferences] : randomPanelPreferences());
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
  if (serviceState.value === 'incomplete') return '请选满三位评审投资人';
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
  unavailable: '这组评审阵容暂时繁忙，请稍后重试',
  error: '暂时连接不到评审服务，请检查网络后重试',
  incomplete: '请选满三种评审偏好，再确认服务状态',
})[serviceState.value]);
const currentIndustry = computed(() => getIndustry(industry.value));
const currentRound = computed(() => getRound(round.value));
const panel = computed(() =>
  preferences.value.map((preference) => getSpecialist(industry.value, round.value, preference)),
);
const panelReady = computed(() => panelPreferencesSchema.safeParse(preferences.value).success);
const panelKey = computed(() => `${industry.value}|${round.value}|${preferences.value.join(',')}`);
const submissionResult = computed(() => submissionSchema.safeParse({
  projectName: projectName.value,
  industry: industry.value,
  round: round.value,
  preferences: preferences.value,
  stage: stage.value,
  description: description.value,
  bpText: bpText.value,
  referralProjectId:referralProjectId.value,
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
  reviewing: '已向三位投资人发起请求',
})[phase.value]);
const busyDescription = computed(() => ({
  checking: '先核对已有订单，已有额度或报告时不会重复付款。',
  payment: `本次真实评审 ${priceLabel.value}，支付结果以服务端确认为准。`,
  confirming: '请勿重复付款。确认后会自动开始评审，已付款额度会保留。',
  starting: '资料提交成功后，三位投资人将分别给出反馈。',
  reviewing: `已完成 ${completed.value} / ${PANEL_SIZE}，最终报告按实际完成展示。`,
})[phase.value]);
const WAIT_TIPS = [
  '投资人正在读你的项目介绍',
  '正在核对商业模式里的关键假设',
  '正在找最可能被投资人追问的地方',
  '正在给八个维度逐项打分',
  '正在整理最该先做的一件事',
];
const tipIndex = ref(0);
let tipTimer: ReturnType<typeof setInterval> | undefined;
watch(
  () => busy.value && phase.value === 'reviewing',
  (waiting) => {
    if (tipTimer) clearInterval(tipTimer);
    tipTimer = undefined;
    if (!waiting) return;
    tipIndex.value = 0;
    tipTimer = setInterval(() => {
      tipIndex.value = (tipIndex.value + 1) % WAIT_TIPS.length;
    }, 3600);
  },
  { immediate: true },
);
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
  if(options?.referral && /^[A-Za-z0-9_-]{22}$/.test(options.referral))referralProjectId.value=options.referral;
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
  if (advanceTimer) clearTimeout(advanceTimer);
  if (tipTimer) clearInterval(tipTimer);
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

// ---- Step-by-step flow: one question per screen, mostly tap to advance ----
const FIELD_STEP: Record<string, number> = {
  projectName: 0,
  description: 1,
  industry: 2,
  round: 3,
  stage: 4,
  tone: 5,
  preferences: 5,
  consent: 6,
  bpText: 6,
};
const DESCRIPTION_PROMPTS = ['服务谁：', '解决什么问题：', '怎么赚钱：', '已经验证了什么：'];
const STAGE_HINTS: Record<string, string> = {
  想法阶段: '还在验证问题是否真实',
  已有原型: '做出了能演示的东西',
  已有用户: '有人在用，但还没稳定收费',
  已有收入: '已经有客户付钱',
  规模增长: '收入在持续放大',
};
const draftReady = Boolean(
  memoryDraft &&
    submissionSchema.shape.projectName.safeParse(memoryDraft.projectName).success &&
    submissionSchema.shape.description.safeParse(memoryDraft.description).success,
);
let advanceTimer: ReturnType<typeof setTimeout> | undefined;
const { step, direction, currentStep, progress, stepError, stepTried, goTo, next, back,
  inputName, inputDescription, confirmName } = usePitchWizard({
  projectName, description, preferences, attempted,
  startAt: draftReady || getKnownRecoverable() ? STEPS.length - 1 : 0,
  onEdit: () => { exampleFilled.value = false; },
  onInvalid: (current) => { if (current === 'panel') preferenceEditor.value = true; tapFeedback(); },
  onNavigate: () => {
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = undefined;
    uni.hideKeyboard();
    uni.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
});
const descriptionLength = computed(() => description.value.trim().length);
function tapFeedback() {
  // #ifdef MP-WEIXIN
  try {
    uni.vibrateShort({ type: 'light' } as UniApp.VibrateShortOptions);
  } catch {
    /* Haptics are a nicety only. */
  }
  // #endif
}
/** Tap a choice: select it, give the selection a beat to animate, then move on. */
function choose(apply: () => void) {
  apply();
  tapFeedback();
  if (advanceTimer) clearTimeout(advanceTimer);
  const from = step.value;
  advanceTimer = setTimeout(() => {
    advanceTimer = undefined;
    if (step.value === from) goTo(from + 1);
  }, 320);
}
function addPrompt(prompt: string) {
  if (description.value.includes(prompt)) return;
  const current = description.value.replace(/\s+$/, '');
  description.value = current ? `${current}\n${prompt}` : prompt;
  exampleFilled.value = false;
  tapFeedback();
}
function scrollToField(field: string) {
  if (field === 'preferences') preferenceEditor.value = true;
  if (field === 'bpText') expandedBP.value = true;
  if (field in FIELD_STEP) goTo(FIELD_STEP[field]);
  stepTried.value = true;
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
  preferences.value = randomPanelPreferences();
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
  goTo(0);
}

function setStage(event: { detail: { value: string | number } }) {
  stage.value = STAGES[Number(event.detail.value)];
}
function toggleConsent() {
  consent.value = !consent.value;
  setAIDataConsent(consent.value);
}
function togglePreference(id: PreferenceId) {
  const result = togglePanelPreference(preferences.value, id);
  preferences.value = result.preferences;
  preferenceError.value = result.error;
}
function inputBP(event: unknown) {
  const value = (event as { detail?: { value?: unknown } } | undefined)?.detail?.value;
  if (typeof value === 'string') {
    bpText.value = value;
    exampleFilled.value = false;
  }
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
    error.value = '评审服务暂时不可用，请稍后重试。本次不会扣费。';
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
        throw new Error('这组评审阵容暂时不可用，本次不会发起付款。可以换一组投资人或稍后重试。');
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
    <form @submit="next">
    <PageHeader back label="项目评审" />

    <view class="wizard-progress" role="progressbar" :aria-valuenow="step + 1" aria-valuemin="1" :aria-valuemax="STEPS.length">
      <view class="wizard-track"><view class="wizard-fill" :style="{ width: `${progress * 100}%` }" /></view>
      <text class="wizard-count">{{ step + 1 }} / {{ STEPS.length }}</text>
    </view>

    <view v-if="recoverableJobId && !busy" class="recovery-card">
      <view class="recovery-title">有一份评审可以继续</view>
      <text>直接领取报告，无需重填，也不会再次付款。</text>
      <button class="primary lime" :disabled="checkingOrders" @click="submit">继续已有评审 →</button>
    </view>
    <view v-if="notice" class="notice form-notice" role="status">{{ notice }}</view>

    <view :key="step" class="step-pane" :class="direction">
      <!-- 1. 名称 -->
      <template v-if="currentStep === 'name'">
        <text class="step-eyebrow">先认识一下</text>
        <view class="step-title">你的项目叫什么？</view>
        <input
          :value="projectName"
          name="projectName"
          class="big-input"
          :class="{ invalid: stepError }"
          placeholder="例如：小店会员通"
          :maxlength="32"
          confirm-type="next"
          aria-label="项目名称，必填，最多32字"
          :aria-invalid="Boolean(stepError)"
          @input="inputName"
          @blur="inputName"
          @confirm="confirmName"
        />
        <view class="input-meta"><text>一个能被记住的名字就够了</text><text>{{ projectName.length }}/32</text></view>
        <text v-if="stepError" class="field-error shake" role="alert">{{ stepError }}</text>
        <view v-if="draftRestored" class="draft-line">
          <text>已恢复上次的草稿</text>
          <button class="inline-link" :disabled="busy || uploading || confirmingExample || configLoading || checkingOrders || Boolean(recoverableJobId)" @click="clearDraft">清空重填</button>
        </view>
        <view class="trust-card">
          <view class="trust-item"><text class="trust-icon">✎</text><view><text class="trust-title">3 分钟填完</text><text class="trust-sub">名称加几句介绍就能开始，BP 选填</text></view></view>
          <view class="trust-item"><text class="trust-icon">✳</text><view><text class="trust-title">30–90 秒出报告</text><text class="trust-sub">3 位 AI 投委按你的行业与轮次逐项追问</text></view></view>
          <view class="trust-item"><text class="trust-icon">◈</text><view><text class="trust-title">报告默认私密</text><text class="trust-sub">只有你主动公开，别人才看得到</text></view></view>
        </view>
      </template>

      <!-- 2. 介绍 -->
      <template v-else-if="currentStep === 'about'">
        <text class="step-eyebrow">{{ projectName || '你的项目' }}</text>
        <view class="step-title">用几句话说清它</view>
        <text class="step-sub">点下面的提示，按顺序写就行；还没验证也可以直说。</text>
        <view class="prompt-chips">
          <button hover-class="is-pressed" hover-stay-time="80" v-for="prompt in DESCRIPTION_PROMPTS" :key="prompt" class="prompt-chip" :class="{ used: description.includes(prompt) }" @click="addPrompt(prompt)">{{ description.includes(prompt) ? '✓ ' : '+ ' }}{{ prompt.replace('：', '') }}</button>
        </view>
        <textarea
          :value="description"
          name="description"
          class="big-textarea"
          :class="{ invalid: stepError }"
          placeholder="我们为……提供……，通过……收费。目前已经……"
          :maxlength="3000"
          :auto-height="false"
          aria-label="项目介绍，必填，30至3000字"
          :aria-invalid="Boolean(stepError)"
          @input="inputDescription"
          @blur="inputDescription"
        />
        <view class="length-meter">
          <view class="length-track"><view class="length-fill" :class="{ done: descriptionLength >= 30 }" :style="{ width: `${Math.min(1, descriptionLength / 30) * 100}%` }" /></view>
          <text :class="{ ok: descriptionLength >= 30 }">{{ descriptionLength >= 30 ? '✓ 足够开始了' : `还差 ${30 - descriptionLength} 字` }}</text>
        </view>
        <text v-if="stepError" class="field-error shake" role="alert">{{ stepError }}</text>
      </template>

      <!-- 3. 行业 -->
      <template v-else-if="currentStep === 'industry'">
        <text class="step-eyebrow">评审视角</text>
        <view class="step-title">它属于哪个行业？</view>
        <text class="step-sub">选最接近的一项，点一下就会进入下一步。</text>
        <view class="choice-grid">
          <button hover-class="is-pressed" hover-stay-time="80" v-for="(item, index) in INDUSTRIES" :key="item.id" class="choice-card" :class="{ selected: industry === item.id }" :style="{ animationDelay: `${index * 35}ms` }" :aria-pressed="industry === item.id" @click="choose(() => (industry = item.id))">
            <text class="choice-icon">{{ item.icon }}</text>
            <text class="choice-name">{{ item.name }}</text>
            <text class="choice-sub">{{ item.subtitle }}</text>
            <text class="choice-check">✓</text>
          </button>
        </view>
      </template>

      <!-- 4. 轮次 -->
      <template v-else-if="currentStep === 'round'">
        <text class="step-eyebrow">{{ currentIndustry.name }}</text>
        <view class="step-title">准备融哪一轮？</view>
        <text class="step-sub">轮次不同，投资人追问的重点也不同。</text>
        <view class="choice-list">
          <button hover-class="is-pressed" hover-stay-time="80" v-for="(item, index) in FUNDING_ROUNDS" :key="item.id" class="choice-row" :class="{ selected: round === item.id }" :style="{ animationDelay: `${index * 40}ms` }" :aria-pressed="round === item.id" @click="choose(() => (round = item.id))">
            <view class="choice-row-copy"><text class="choice-name">{{ item.name }}</text><text class="choice-sub">“{{ item.question }}”</text></view>
            <text class="choice-check">✓</text>
          </button>
        </view>
      </template>

      <!-- 5. 阶段 -->
      <template v-else-if="currentStep === 'stage'">
        <text class="step-eyebrow">{{ currentIndustry.name }} · {{ currentRound.name }}</text>
        <view class="step-title">项目现在走到哪一步？</view>
        <text class="step-sub">如实选择，投资人会按这个阶段来要求证据。</text>
        <view class="choice-list">
          <button hover-class="is-pressed" hover-stay-time="80" v-for="(item, index) in STAGES" :key="item" class="choice-row" :class="{ selected: stage === item }" :style="{ animationDelay: `${index * 40}ms` }" :aria-pressed="stage === item" @click="choose(() => (stage = item))">
            <view class="choice-row-copy"><text class="choice-name">{{ item }}</text><text class="choice-sub">{{ STAGE_HINTS[item] }}</text></view>
            <text class="choice-check">✓</text>
          </button>
        </view>
      </template>

      <!-- 6. 评审阵容 -->
      <template v-else-if="currentStep === 'panel'">
        <text class="step-eyebrow">你的 AI 投委会</text>
        <view class="step-title">想听哪种说法？</view>
        <view class="tone-options">
          <button hover-class="is-pressed" hover-stay-time="80" class="tone-card" :class="{ selected: tone === 'sharp' }" :aria-pressed="tone === 'sharp'" @click="tone = 'sharp'; tapFeedback()"><view class="tone-top"><text>✳ 犀利版</text><view class="radio-dot" /></view><text class="tone-description">直说问题，追问到底</text></button>
          <button hover-class="is-pressed" hover-stay-time="80" class="tone-card" :class="{ selected: tone === 'balanced' }" :aria-pressed="tone === 'balanced'" @click="tone = 'balanced'; tapFeedback()"><view class="tone-top"><text>◈ 专业版</text><view class="radio-dot" /></view><text class="tone-description">冷静拆解，给出建议</text></button>
        </view>
        <view class="panel-heading"><text>这三位投资人会审你的项目</text><text class="panel-tag">AI 投资人</text></view>
        <view class="panel-people">
          <view v-for="(person, index) in panel" :key="person.id" class="panel-person" :style="{ animationDelay: `${index * 90}ms` }">
            <InvestorAvatar :investor="person" small />
            <view class="panel-person-copy"><text class="panel-name">{{ person.name }}</text><text class="panel-title">{{ person.title }}</text></view>
          </view>
        </view>
        <button class="inline-link panel-toggle" :aria-expanded="preferenceEditor" @click="preferenceEditor = !preferenceEditor">{{ preferenceEditor ? '收起' : '换几位投资人' }} {{ preferenceEditor ? '−' : '→' }}</button>
        <view v-if="preferenceEditor" class="preference-editor">
          <text class="caption">选满三种关注点，每种对应一位投资人。</text>
          <view class="preference-choices"><button v-for="item in PREFERENCES" :key="item.id" :class="{ selected: preferences.includes(item.id) }" :aria-pressed="preferences.includes(item.id)" @click="togglePreference(item.id); tapFeedback()">{{ preferences.includes(item.id) ? '✓ ' : '' }}{{ item.name }}</button></view>
          <text v-if="preferenceError || !panelReady || fieldErrors.preferences" class="preference-hint" role="alert">{{ preferenceError || fieldErrors.preferences || `还差 ${PANEL_SIZE - preferences.length} 位，或随机换一组。` }}</text>
          <view class="editor-links">
            <button class="inline-link" @click="preferences = randomPanelPreferences(); preferenceError = ''">随机换一组</button>
            <button class="inline-link" @click="uni.navigateTo({ url: `/pages/investors/index?industry=${industry}&round=${round}&preferences=${preferences.join(',')}` })">认识全部投资人 →</button>
          </view>
        </view>
      </template>

      <!-- 7. 确认 -->
      <template v-else>
        <text class="step-eyebrow">最后一步</text>
        <view class="step-title">确认一下，就开始</view>
        <view class="summary-card">
          <button hover-class="is-pressed" hover-stay-time="80" class="summary-row" @click="goTo(0)"><text class="summary-label">项目</text><text class="summary-value">{{ projectName || '未填写' }}</text><text class="summary-edit">改</text></button>
          <button hover-class="is-pressed" hover-stay-time="80" class="summary-row" @click="goTo(2)"><text class="summary-label">视角</text><text class="summary-value">{{ currentIndustry.shortName }} · {{ currentRound.name }} · {{ stage }}</text><text class="summary-edit">改</text></button>
          <button hover-class="is-pressed" hover-stay-time="80" class="summary-row" @click="goTo(5)"><text class="summary-label">投资人</text><text class="summary-value">{{ panelReady ? preferenceSummary : `已选 ${preferences.length} / 3` }} · {{ tone === 'sharp' ? '犀利' : '专业' }}</text><text class="summary-edit">改</text></button>
        </view>

        <button hover-class="is-pressed" hover-stay-time="80" id="field-consent" class="consent-toggle" :class="{ checked: consent, invalid: fieldErrors.consent }" role="checkbox" :aria-checked="consent" @click="toggleConsent(); tapFeedback()">
          <view class="switch"><view class="switch-knob" /></view>
          <text>同意把本次资料交给 DeepSeek 评审，报告不会自动公开</text>
        </button>
        <view class="consent-links">
          <button class="inline-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=ai' })">资料怎么处理</button>
          <button class="inline-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=terms' })">使用须知</button>
        </view>
        <text v-if="fieldErrors.consent" class="field-error shake" role="alert">请先打开上面的授权开关。</text>

        <button class="fold-row" :aria-expanded="expandedBP" @click="expandedBP = !expandedBP">
          <view><text class="fold-title">补充商业计划书</text><text class="fold-sub">{{ filename || (bpText ? `已有 ${bpText.length.toLocaleString()} 字` : '选填，不补充也能评审') }}</text></view>
          <text class="fold-icon" :class="{ open: expandedBP }">+</text>
        </button>
        <view v-if="expandedBP" id="field-bpText" class="fold-body">
          <button class="upload-box" :disabled="uploading || busy" @click="upload"><view class="upload-icon">{{ uploading ? '◌' : '↥' }}</view><view class="upload-copy"><text class="upload-title">{{ uploading ? '正在提取文字…' : filename || '上传 BP 文件' }}</text><text class="upload-description">PDF / PPTX / DOCX / TXT / MD · 10 MB 内</text></view></button>
          <text v-if="uploadError" class="field-error" role="alert">{{ uploadError }}</text>
          <text v-if="uploadNotice" class="upload-notice" role="status">{{ uploadNotice }}</text>
          <textarea :value="bpText" class="bp-input" :disabled="uploading" placeholder="或直接粘贴：客户、市场、竞争、收入成本、团队、融资用途……" :maxlength="50000" aria-label="补充项目资料，选填，最多50000字" @input="inputBP" />
          <text class="bp-count">{{ bpText.length.toLocaleString() }}/50,000</text>
          <text v-if="fieldErrors.bpText" class="field-error" role="alert">{{ fieldErrors.bpText }}</text>
        </view>

        <view class="value-list">
          <text class="value-title">你会得到</text>
          <view class="value-item" v-for="(item, index) in ['3 位 AI 投委逐条追问你的项目', '八维评分 + 红旗 / 橙旗风险诊断', '按优先级排好的改进清单', '一张可以发朋友圈的评审海报']" :key="item" :style="{ animationDelay: `${index * 60}ms` }"><text class="value-check">✓</text><text>{{ item }}</text></view>
        </view>
        <view class="price-card">
          <view class="price-line"><ReviewOfferStatus :state="offerState" :offer="currentOffer" /><text v-if="billing" class="credit-pill">可用 {{ billing.credits }} 次</text></view>
          <view v-if="serviceState !== 'error'" class="service-status" :class="{ unavailable: serviceState !== 'ready' }" role="status"><view class="service-dot" /><text>{{ availability }}</text><button v-if="serviceState === 'unavailable'" class="inline-link" :disabled="configLoading" @click="loadConfig">重试</button></view>
          <button v-else class="inline-link" :disabled="configLoading" @click="loadConfig">{{ configLoading ? '正在重新连接…' : '重新连接 ↻' }}</button>
          <text class="guarantee">全部失败不计次 · 中途退出不中断 · 报告默认私密</text>
          <view v-if="billing?.orders.some(order => order.status === 'pending')" class="pending-payment">有待确认订单。若已扣款，请先查询，勿重复付款。</view>
          <text v-if="billingError" class="field-error" role="alert">{{ billingError }}</text>
          <button class="fold-row compact" :aria-expanded="ordersExpanded" @click="ordersExpanded = !ordersExpanded"><text class="fold-sub">费用、订单与退款</text><text class="fold-icon" :class="{ open: ordersExpanded }">+</text></button>
          <view v-if="ordersExpanded" class="billing-details">
            <text v-if="paymentsEnabled && !billing" class="billing-rule">尚未查询你的额度；确认时会先查账户，有额度优先使用。</text>
            <text class="billing-rule">至少一位投资人生成报告即计 1 次；全部失败会恢复额度。中途退出不会中断评审。未使用额度退款由人工处理。</text>
            <button class="inline-link" :disabled="busy || checkingOrders" @click="refreshBilling">{{ checkingOrders ? '正在查询…' : '查询订单与额度 ↻' }}</button>
            <view v-for="order in billing?.orders.slice(0, 5)" :key="order.id" class="billing-order"><text>{{ orderLabels[order.status] || order.status }} · {{ order.id.slice(-8) }}</text><button class="inline-link" @click="uni.setClipboardData({ data: order.id })">复制订单号</button></view>
            <template v-if="billing?.supportContact || currentOffer?.supportContact"><button class="inline-link" @click="uni.setClipboardData({ data: billing?.supportContact || currentOffer?.supportContact || '' })">复制客服联系方式</button><text class="billing-support">{{ billing?.supportContact || currentOffer?.supportContact }}</text></template>
            <text v-else class="billing-support">暂未取得客服联系信息，可在说明页重新获取。</text>
            <view class="editor-links"><button class="inline-link" @click="uni.navigateTo({ url: aboutPath('orders') })">已扣款没有报告？</button><button class="inline-link" @click="uni.navigateTo({ url: aboutPath('refund') })">计次与退款</button></view>
          </view>
        </view>
        <view v-if="error" class="error-box shake" role="alert">{{ error }}</view>
        <text v-if="attempted && !submissionResult.success && !recoverableJobId" class="field-error" role="alert">还有内容没填好，已带你回到对应步骤。填写错误不会发起付款。</text>
        <text class="submit-footnote">{{ recoverableJobId ? '查询的是已有评审，不会创建新订单。' : '通常 30–90 秒出结果，仅供参考，不构成投资建议。' }}</text>
      </template>
    </view>

    <view class="action-bar">
      <button v-if="step > 0" class="action-back" aria-label="上一步" @click="back">←</button>
      <button v-if="currentStep !== 'confirm'" class="primary action-next" form-type="submit">{{ currentStep === 'panel' && !panelReady ? `再选 ${PANEL_SIZE - preferences.length} 位投资人` : '下一步' }}</button>
      <button v-else class="primary lime action-next" :disabled="busy || uploading || confirmingExample || checkingOrders || (!recoverableJobId && configLoading) || (!recoverableJobId && serviceState !== 'ready')" @click="submit"><text>{{ confirmingExample ? '请确认示例用途…' : paymentLabel }}</text><text>↗</text></button>
    </view>

    <view v-if="busy" class="loading-overlay" role="dialog" aria-modal="true" aria-label="评审进行中">
      <view class="loading-card">
        <view class="orbit" :class="{ live: phase === 'reviewing' }">
          <view class="orbit-ring" /><view class="orbit-ring delay" />
          <view class="orbit-core">✳</view>
        </view>
        <view class="loading-title">{{ busyTitle }}</view>
        <text class="loading-description" role="status">{{ busyDescription }}</text>
        <view v-if="phase === 'reviewing'">
          <view v-if="!resumingJob" class="loading-people">
            <view v-for="(person, index) in panel" :key="person.id" class="loading-person" :class="{ done: index < completed }" :style="{ animationDelay: `${index * 0.4}s` }"><InvestorAvatar :investor="person" small /><text class="loading-person-state">{{ index < completed ? '✓' : '' }}</text></view>
          </view>
          <view class="progress-track"><view class="progress-fill" :style="{ width: `${Math.max(6, (completed / PANEL_SIZE) * 100)}%` }" /></view>
          <view class="tip-line"><text :key="tipIndex" class="tip-text">{{ WAIT_TIPS[tipIndex] }}…</text></view>
        </view>
        <text v-else class="loading-footnote">{{ phase === 'starting' ? '正在确认提交结果，请留在本页。' : paymentsEnabled ? '先确认已有订单与额度，再开始评审。' : '正在检查评审服务。' }}</text>
        <button class="secondary pause-button" :disabled="cancelling || phase === 'starting'" @click="pause">{{ phase === 'starting' ? '正在确认提交…' : pendingJobId ? '先回去，评审在后台继续' : '暂时返回' }}</button>
        <button v-if="pendingJobId && !paymentsEnabled && !resumingJob" class="cancel-button" :disabled="cancelling" @click="cancel">{{ cancelling ? '正在取消…' : '取消本次评审' }}</button>
      </view>
    </view>
    </form>
  </view>
</template>

<style scoped>
.pitch-page { padding-bottom: calc(108px + env(safe-area-inset-bottom)); }
/* progress */
.wizard-progress { display: flex; align-items: center; gap: 12px; margin: 2px 0 18px; }
.wizard-track { flex: 1; height: 6px; border-radius: 3px; background: #e2e8d8; overflow: hidden; }
.wizard-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #2f684e, #8fbf5a); transition: width .45s cubic-bezier(.2,.8,.2,1); }
.wizard-count { font-size: 12px; color: #6b7867; font-variant-numeric: tabular-nums; }
/* step pane transitions */
.step-pane { animation: step-in-forward .38s cubic-bezier(.2,.8,.2,1) both; }
.step-pane.back { animation-name: step-in-back; }
@keyframes step-in-forward { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes step-in-back { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
.step-eyebrow { display: block; font-size: 12px; font-weight: 700; color: #2f684e; letter-spacing: 1px; }
.step-title { font-size: 26px; line-height: 1.35; font-weight: 800; letter-spacing: -.5px; margin: 8px 0 8px; }
.step-sub { display: block; font-size: 13px; color: #66725f; line-height: 1.8; margin-bottom: 18px; }
/* inputs */
.big-input { width: 100%; height: 60px; margin-top: 14px; padding: 0 16px; font-size: 19px; font-weight: 700; background: #fff; border: 1.5px solid #d6decd; border-radius: 16px; transition: border-color .2s, box-shadow .2s; }
.big-input:focus, .big-textarea:focus { border-color: #2f684e; box-shadow: 0 0 0 4px #2f684e1a; }
.big-textarea { width: 100%; height: 210px; padding: 14px 16px; font-size: 15px; line-height: 1.9; background: #fff; border: 1.5px solid #d6decd; border-radius: 16px; transition: border-color .2s, box-shadow .2s; }
.invalid { border-color: #bc684a !important; background: #fffaf6 !important; }
.input-meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #737d69; }
.field-error { display: block; margin-top: 10px; color: #a24c30; font-size: 13px; line-height: 1.8; }
.shake { animation: shake .36s ease; }
@keyframes shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
.draft-line { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding: 4px 14px; border-radius: 12px; background: #eef3e4; font-size: 13px; color: #4e6545; }
.inline-link { min-height: 44px; padding: 10px 0; color: #2f684e; font-size: 13px; font-weight: 600; text-align: left; }
/* description helpers */
.prompt-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.prompt-chip { min-height: 36px; padding: 6px 12px; border-radius: 18px; font-size: 13px; color: #2f684e; background: #edf3e2; border: 1px solid #d4e1c0; transition: transform .15s, background .2s; }
.prompt-chip:active { transform: scale(.94); }
.prompt-chip.used { background: #2f684e; color: #fff; border-color: #2f684e; }
.length-meter { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 12px; color: #966135; }
.length-meter .ok { color: #2f684e; font-weight: 700; }
.length-track { flex: 1; height: 4px; border-radius: 2px; background: #e6eadf; overflow: hidden; }
.length-fill { height: 100%; background: #d6a15f; transition: width .3s ease, background .3s; }
.length-fill.done { background: #4f8a55; }
/* choice cards */
.choice-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.choice-card, .choice-row { position: relative; text-align: left; background: #fff; border: 1.5px solid #e0e6d6; border-radius: 16px; animation: rise .4s cubic-bezier(.2,.8,.2,1) both; transition: transform .16s ease, border-color .2s, background .2s, box-shadow .2s; }
.choice-card { padding: 14px 14px 13px; min-height: 104px; }
.choice-card:active, .choice-row:active { transform: scale(.97); }
.choice-card.selected, .choice-row.selected { border-color: #2f684e; background: #f0f6e6; box-shadow: 0 6px 18px #2f684e1f; }
.choice-icon { display: block; font-size: 20px; color: #2f684e; }
.choice-name { display: block; font-size: 15px; font-weight: 750; margin-top: 4px; }
.choice-sub { display: block; font-size: 12px; color: #6a7664; line-height: 1.6; margin-top: 3px; }
.choice-check { position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; background: #2f684e; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(.4); transition: opacity .2s, transform .25s cubic-bezier(.3,1.6,.5,1); }
.selected .choice-check { opacity: 1; transform: scale(1); }
.choice-list { display: flex; flex-direction: column; gap: 10px; }
.choice-row { display: flex; align-items: center; width: 100%; min-height: 64px; padding: 12px 46px 12px 16px; }
.choice-row .choice-name { margin-top: 0; }
.choice-row .choice-check { top: 50%; margin-top: -11px; right: 14px; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
/* tone + panel */
.tone-options { display: flex; gap: 10px; margin: 12px 0 24px; }
.tone-card { flex: 1; border: 1.5px solid #e0e6d6; border-radius: 16px; padding: 14px 12px; background: #fff; text-align: left; transition: border-color .2s, background .2s, transform .15s; }
.tone-card:active { transform: scale(.97); }
.tone-card.selected { background: #f0f6e6; border-color: #2f684e; }
.tone-top { display: flex; align-items: center; justify-content: space-between; font-size: 15px; font-weight: 750; }
.radio-dot { border: 1.5px solid #bcc9aa; width: 16px; height: 16px; border-radius: 50%; transition: border-width .2s; }
.selected .radio-dot { border: 5px solid #2f684e; background: #fff; }
.tone-description { display: block; font-size: 12px; color: #65765a; margin-top: 6px; line-height: 1.7; }
.panel-heading { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #354e35; margin-bottom: 12px; }
.panel-tag { font-size: 11px; font-weight: 500; color: #65765b; border: 1px solid #ced9bc; border-radius: 6px; padding: 1px 6px; }
.panel-people { display: flex; flex-direction: column; gap: 10px; }
.panel-person { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #fff; border: 1px solid #e3e8da; border-radius: 14px; animation: rise .45s cubic-bezier(.2,.8,.2,1) both; }
.panel-person-copy { flex: 1; min-width: 0; }
.panel-name { display: block; font-size: 14px; font-weight: 700; }
.panel-title { display: block; color: #66785a; font-size: 12px; line-height: 1.6; }
.panel-toggle { margin-top: 6px; }
.preference-editor { padding: 4px 0 6px; animation: rise .3s ease both; }
.preference-editor .caption { font-size: 12px; color: #637258; }
.preference-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.preference-choices button { min-height: 44px; padding: 10px 2px; font-size: 13px; color: #5b6c50; border: 1.5px solid #dbe3cd; border-radius: 12px; background: #fff; transition: all .2s; }
.preference-choices button.selected { background: #2f684e; color: #fff; border-color: #2f684e; font-weight: 700; }
.preference-hint { display: block; margin-top: 10px; font-size: 12px; color: #9a6030; }
.editor-links { display: flex; flex-wrap: wrap; gap: 0 20px; }
/* confirm */
.summary-card { background: #fff; border: 1px solid #e0e6d6; border-radius: 18px; padding: 4px 16px; margin: 14px 0 16px; }
.summary-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 54px; text-align: left; border-bottom: 1px solid #eef1e8; }
.summary-row:last-child { border-bottom: 0; }
.summary-label { width: 34px; flex-shrink: 0; font-size: 12px; color: #7b8676; }
.summary-value { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-edit { font-size: 12px; color: #2f684e; flex-shrink: 0; }
.consent-toggle { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; text-align: left; font-size: 13px; line-height: 1.7; color: #3f4d3a; background: #fff; border: 1.5px solid #e0e6d6; border-radius: 16px; transition: border-color .2s, background .2s; }
.consent-toggle.checked { border-color: #2f684e; background: #f0f6e6; }
.switch { position: relative; width: 44px; height: 26px; flex-shrink: 0; border-radius: 13px; background: #cfd6c6; transition: background .25s; }
.switch-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0003; transition: transform .28s cubic-bezier(.3,1.4,.5,1); }
.checked .switch { background: #2f684e; }
.checked .switch-knob { transform: translateX(18px); }
.consent-links { display: flex; gap: 20px; padding-left: 4px; }
.consent-links .inline-link { font-size: 12px; font-weight: 500; }
.fold-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 56px; padding: 10px 0; text-align: left; border-top: 1px solid #e3e8da; margin-top: 8px; }
.fold-row.compact { min-height: 44px; margin-top: 4px; padding: 6px 0 0; }
.fold-title { display: block; font-size: 14px; font-weight: 700; }
.fold-sub { display: block; font-size: 12px; color: #6a7664; }
.fold-icon { font-size: 20px; color: #2f684e; transition: transform .25s ease; }
.fold-icon.open { transform: rotate(45deg); }
.fold-body, .billing-details { animation: rise .3s ease both; }
.upload-box { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px; text-align: left; border: 1.5px dashed #a9bc8c; border-radius: 14px; background: #f3f7ea; }
.upload-icon { font-size: 24px; color: #6e8b51; }
.upload-copy { flex: 1; min-width: 0; }
.upload-title { display: block; font-size: 13px; font-weight: 700; word-break: break-all; }
.upload-description { display: block; color: #657559; font-size: 12px; }
.upload-notice { display: block; margin-top: 8px; font-size: 12px; color: #506d40; }
.bp-input { width: 100%; height: 160px; margin-top: 10px; padding: 12px 14px; font-size: 14px; line-height: 1.8; background: #fff; border: 1.5px solid #d6decd; border-radius: 14px; }
.bp-count { display: block; text-align: right; margin-top: 6px; font-size: 12px; color: #6d7c60; }
.price-card { margin-top: 16px; padding: 14px 16px; background: #edf2e3; border-radius: 16px; }
.price-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.credit-pill { font-size: 12px; padding: 4px 10px; border-radius: 20px; color: #2f684e; background: #fff; }
.service-status { display: flex; gap: 8px; align-items: center; min-height: 36px; color: #4c6955; font-size: 12px; }
.service-status > text { flex: 1; }
.service-status.unavailable { color: #786843; }
.service-dot { width: 7px; height: 7px; border-radius: 50%; background: #2f684e; flex-shrink: 0; animation: pulse-dot 2s ease-in-out infinite; }
.unavailable .service-dot { background: #a18c59; animation: none; }
@keyframes pulse-dot { 50% { box-shadow: 0 0 0 5px #2f684e22; } }
.pending-payment { color: #895d2b; background: #fff5df; border-radius: 8px; padding: 10px; margin-top: 6px; font-size: 12px; }
.billing-rule { display: block; margin-top: 8px; color: #596f4b; font-size: 12px; line-height: 1.8; }
.billing-order { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #d4dfc3; font-size: 12px; color: #5d6c50; }
.billing-support { display: block; font-size: 12px; color: #627454; overflow-wrap: anywhere; }
.recovery-card { padding: 16px; border: 1px solid #b5c797; border-radius: 16px; background: #edf3e3; margin-bottom: 16px; animation: rise .4s ease both; }
.recovery-title { font-size: 16px; font-weight: 750; }
.recovery-card > text { display: block; font-size: 13px; color: #56694d; margin: 4px 0 12px; }
.form-notice { margin-bottom: 14px; font-size: 13px; animation: rise .3s ease both; }
.submit-footnote { display: block; text-align: center; margin-top: 14px; color: #6b7662; font-size: 12px; }
/* sticky action bar */
.action-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; max-width: 560px; margin: 0 auto; display: flex; gap: 10px; padding: 12px 24px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, #f7f7f000, #f7f7f0 30%); }
.action-back { width: 54px; height: 54px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; border-radius: 16px; background: #fff; border: 1px solid #dfe5d7; transition: transform .15s; }
.action-back:active { transform: scale(.94); }
.action-next { flex: 1; border-radius: 16px !important; }
/* waiting overlay */
.loading-overlay { position: fixed; inset: 0; z-index: 99; display: flex; align-items: center; justify-content: center; padding: 24px; background: #18281fcc; animation: fade .3s ease both; }
@keyframes fade { from { opacity: 0; } }
.loading-card { width: 100%; max-width: 360px; max-height: 88vh; overflow-y: auto; background: #f7f8f0; border-radius: 26px; padding: 26px 22px 16px; text-align: center; animation: pop .45s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes pop { from { opacity: 0; transform: scale(.92) translateY(12px); } }
.orbit { position: relative; width: 92px; height: 92px; margin: 0 auto 14px; }
.orbit-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #8fbf5a; opacity: 0; animation: ripple 2.4s ease-out infinite; }
.orbit-ring.delay { animation-delay: 1.2s; }
@keyframes ripple { from { transform: scale(.55); opacity: .9; } to { transform: scale(1.15); opacity: 0; } }
.orbit-core { position: absolute; inset: 22px; border-radius: 50%; background: #2f684e; color: #d9f18a; font-size: 26px; display: flex; align-items: center; justify-content: center; animation: spin 6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-title { font-size: 21px; font-weight: 800; line-height: 1.5; }
.loading-description { display: block; font-size: 13px; color: #596a50; margin-top: 6px; line-height: 1.8; }
.loading-people { display: flex; justify-content: center; gap: 14px; margin: 18px 0 14px; }
.loading-person { position: relative; animation: bob 1.2s ease-in-out infinite; }
.loading-person.done { animation: none; }
.loading-person-state { position: absolute; right: -4px; bottom: -4px; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; color: #fff; background: #2f684e; display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(.4); transition: all .3s cubic-bezier(.3,1.6,.5,1); }
.done .loading-person-state { opacity: 1; transform: scale(1); }
@keyframes bob { 50% { transform: translateY(-5px); } }
.progress-track { height: 6px; background: #dfe7d1; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #4f8a55, #9cc95f, #4f8a55); background-size: 200% 100%; transition: width .6s ease; animation: shimmer 1.6s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
.tip-line { height: 24px; margin-top: 12px; overflow: hidden; }
.tip-text { display: block; font-size: 12px; color: #5d6f52; animation: tip-in .5s ease both; }
@keyframes tip-in { from { opacity: 0; transform: translateY(10px); } }
.loading-footnote { display: block; color: #6c795e; font-size: 12px; margin-top: 14px; }
.pause-button { margin-top: 18px; font-size: 13px; color: #2f684e; background: #fff; border-color: #cdd9bb; }
.cancel-button { font-size: 12px; color: #7d6349; margin-top: 4px; min-height: 44px; padding: 12px; }
@media (prefers-reduced-motion: reduce) {
  .step-pane, .choice-card, .choice-row, .panel-person, .recovery-card, .form-notice, .fold-body, .billing-details, .preference-editor, .loading-overlay, .loading-card, .tip-text, .shake { animation: none !important; }
  .orbit-ring, .orbit-core, .loading-person, .progress-fill, .service-dot { animation: none !important; }
  .wizard-fill, .length-fill, .switch, .switch-knob, .choice-check, .fold-icon, .progress-fill { transition: none !important; }
}
@media (max-width: 360px) { .step-title { font-size: 23px; } .choice-card { min-height: 96px; } }
.is-pressed { transform: scale(.97); opacity: .92; }
.trust-card { display: flex; flex-direction: column; gap: 14px; margin-top: 30px; padding: 18px 16px; background: #fff; border: 1px solid #e0e6d6; border-radius: 18px; }
.trust-item { display: flex; gap: 12px; align-items: flex-start; animation: rise .45s ease both; }
.trust-item:nth-child(2) { animation-delay: .08s; }
.trust-item:nth-child(3) { animation-delay: .16s; }
.trust-icon { width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: #e8f0d6; color: #2f684e; font-size: 15px; }
.trust-title { display: block; font-size: 14px; font-weight: 700; }
.trust-sub { display: block; font-size: 12px; color: #6a7664; line-height: 1.6; }
.value-list { margin-top: 18px; padding: 14px 16px; background: #fff; border: 1px solid #e0e6d6; border-radius: 16px; }
.value-title { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.value-item { display: flex; gap: 8px; align-items: center; font-size: 13px; line-height: 2; color: #33423a; animation: rise .4s ease both; }
.value-check { color: #2f684e; font-weight: 700; }
.guarantee { display: block; font-size: 12px; color: #2f684e; font-weight: 600; margin: 2px 0 4px; }
@media (prefers-reduced-motion: reduce) { .trust-item, .value-item { animation: none !important; } }
</style>
