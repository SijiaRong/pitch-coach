<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
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
  createDemoReport,
  getIndustry,
  getSpecialist,
  panelPreferencesSchema,
  getRound,
  submissionSchema,
} from '@pitchcoach/shared';
import type { IndustryId, PreferenceId, RoundId, Submission } from '@pitchcoach/shared';
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
} from '@/lib/api';
import { openReport } from '@/lib/storage';
import { hasAIDataConsent, setAIDataConsent } from '@/lib/privacy';

const projectName = ref('');
const industry = ref<IndustryId>('ai');
const round = ref<RoundId>('angel');
const preferences = ref<PreferenceId[]>([...DEFAULT_PREFERENCES]);
const preferenceEditor = ref(false);
const preferenceError = ref('');
const stage = ref<Submission['stage']>('已有原型');
const description = ref('');
const bpText = ref('');
const tone = ref<Submission['tone']>('sharp');
const consent = ref(hasAIDataConsent());
const expandedBP = ref(false);
const filename = ref('');
const uploading = ref(false);
const busy = ref(false);
const completed = ref(0);
const error = ref('');
const availability = ref('正在连接评估服务…');
const currentIndustry = computed(() => getIndustry(industry.value));
const currentRound = computed(() => getRound(round.value));
const panel = computed(() =>
  preferences.value.map((preference) => getSpecialist(industry.value, round.value, preference)),
);
const panelReady = computed(() => preferences.value.length === PANEL_SIZE);
let operation = 0;
let activeId = '';

onLoad((options) => {
  if (options?.industry && INDUSTRY_IDS.includes(options.industry as IndustryId))
    industry.value = options.industry as IndustryId;
  if (options?.round && ROUND_IDS.includes(options.round as RoundId))
    round.value = options.round as RoundId;
  if (options?.preferences) {
    const parsed = panelPreferencesSchema.safeParse(options.preferences.split(','));
    if (parsed.success) preferences.value = parsed.data;
  }
  void getConfig()
    .then((config) => {
      availability.value = config.liveAvailable
        ? 'AI 投委会已就位'
        : '体验示例已开放 · 真实评估待配置 AI 服务';
    })
    .catch(() => {
      availability.value = '示例可直接体验 · 真实评估需连接服务';
    });
});
onUnload(() => {
  void cancel();
});
onShow(() => {
  consent.value = hasAIDataConsent();
});

function toggleConsent() {
  consent.value = !consent.value;
  setAIDataConsent(consent.value);
}

function setStage(event: { detail: { value: string | number } }) {
  stage.value = STAGES[Number(event.detail.value)];
}
function togglePreference(id: PreferenceId) {
  preferenceError.value = '';
  if (preferences.value.includes(id))
    preferences.value = preferences.value.filter((item) => item !== id);
  else if (preferences.value.length < PANEL_SIZE) preferences.value = [...preferences.value, id];
  else preferenceError.value = '先取消一种已选偏好，再邀请新的教练。';
}
function demo() {
  if (panelReady.value)
    openReport(createDemoReport(industry.value, tone.value, round.value, preferences.value));
}
function fillExample() {
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
}
async function upload() {
  error.value = '';
  try {
    const file = await chooseDocument();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      error.value = '文件不能超过 10 MB，请使用精简版 BP。';
      return;
    }
    uploading.value = true;
    const parsed = await uploadDocument(file.path);
    bpText.value = parsed.text;
    filename.value = file.name;
    expandedBP.value = true;
    if (parsed.truncated)
      error.value = '已读取前 50,000 字，超出部分未参与评估。请检查并精简资料。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '上传失败，请重试';
  } finally {
    uploading.value = false;
  }
}
async function cancel() {
  operation++;
  busy.value = false;
  const id = activeId;
  activeId = '';
  if (id) await deleteEvaluation(id).catch(() => undefined);
}
async function submit() {
  error.value = '';
  const parsed = submissionSchema.safeParse({
    projectName: projectName.value,
    industry: industry.value,
    round: round.value,
    preferences: preferences.value,
    stage: stage.value,
    description: description.value,
    bpText: bpText.value,
    tone: tone.value,
    consent: consent.value,
  });
  if (!parsed.success) {
    error.value = parsed.error.issues[0].message;
    return;
  }
  busy.value = true;
  completed.value = 0;
  const generation = ++operation;
  let jobId = '';
  try {
    const job = await evaluate(parsed.data);
    jobId = job.id;
    if (generation !== operation) {
      void deleteEvaluation(jobId).catch(() => undefined);
      return;
    }
    activeId = jobId;
    const deadline = Date.now() + 150000;
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
      if (result.status === 'failed') throw new Error(result.error?.message || '评估失败，请重试');
      if (result.status === 'done' && result.report) {
        busy.value = false;
        activeId = '';
        openReport(result.report);
        void deleteEvaluation(jobId).catch(() => undefined);
        return;
      }
    }
    if (generation === operation)
      throw new Error('评估等待超时，请稍后重试。也可以先查看示例报告。');
  } catch (cause) {
    if (generation === operation)
      error.value = cause instanceof Error ? cause.message : '评估未完成，请重试';
  } finally {
    if (generation === operation) {
      busy.value = false;
      activeId = '';
    }
    if (jobId) void deleteEvaluation(jobId).catch(() => undefined);
  }
}
</script>

<template>
  <view class="page pitch-page">
    <PageHeader />
    <view class="pitch-heading"
      ><text class="eyebrow">YOUR NEXT BIG THING</text
      ><view class="pitch-title">项目不怕小，<br />问题要想透。</view
      ><text class="caption">不用写一份完美的 BP，先把生意说清楚。</text></view
    >
    <view class="field-group"
      ><view class="field-label"
        ><text>项目叫什么</text><text class="field-counter">{{ projectName.length }}/32</text></view
      ><input
        v-model="projectName"
        class="text-input"
        placeholder="一个好记的名字"
        :maxlength="32"
        aria-label="项目名称"
    /></view>

    <view class="field-group"
      ><view class="field-label"
        ><text>在哪个赛道</text><text class="field-hint">匹配本领域专项教练</text></view
      ><view class="industry-choices"
        ><button
          v-for="item in INDUSTRIES"
          :key="item.id"
          class="industry-choice"
          :class="{ selected: industry === item.id }"
          @click="industry = item.id"
        >
          <text>{{ item.icon }}</text> {{ item.shortName }}
        </button></view
      ></view
    >

    <view class="field-group"
      ><view class="field-label"
        ><text>准备融哪一轮</text><text class="field-hint">匹配本轮融资教练</text></view
      ><view class="round-choices"
        ><button
          v-for="item in FUNDING_ROUNDS"
          :key="item.id"
          class="round-choice"
          :class="{ selected: round === item.id }"
          @click="round = item.id"
        >
          {{ item.name }}
        </button></view
      ><view class="round-focus"
        ><text class="round-focus-label">本轮关键问题</text
        ><text>{{ currentRound.question }}</text></view
      ></view
    >
    <view class="field-group"
      ><view class="field-label">产品目前走到哪一步</view
      ><picker :range="STAGES" :value="STAGES.indexOf(stage)" @change="setStage"
        ><view class="stage-picker"
          ><text>{{ stage }}</text
          ><text class="muted">⌄</text></view
        ></picker
      ></view
    >

    <view class="field-group"
      ><view class="field-label"
        ><text>一句话说清你的生意</text
        ><button class="text-link" @click="fillExample">填入虚构示例 ↗</button></view
      ><textarea
        v-model="description"
        class="description-input"
        placeholder="给谁，解决什么问题，怎么赚钱？再加上你已经验证的结果。至少 30 字，有数据就说数据，没有就坦诚说没有。"
        :maxlength="3000"
        :auto-height="false"
        aria-label="项目介绍"
      /><view class="input-footer"
        ><text>事实比形容词更有说服力</text><text>{{ description.length }}/3000</text></view
      ></view
    >

    <view class="field-group"
      ><view class="field-label"
        ><text>再给一点项目资料</text><text class="field-hint">可选</text></view
      ><button class="upload-box" :disabled="uploading" @click="upload">
        <view class="upload-icon">{{ uploading ? '◌' : '↥' }}</view
        ><view
          ><text class="upload-title">{{
            uploading ? '正在提取文字…' : filename || '选择并上传 BP'
          }}</text
          ><text class="upload-description">PDF / PPTX / DOCX / TXT / MD · 最大 10 MB</text></view
        ><text class="upload-plus">+</text></button
      ><view class="upload-privacy-note"
        >文件仅上传至我们的服务器提取文字，开始评估时才交给 DeepSeek。建议先脱敏。
        <button @click="uni.navigateTo({ url: '/pages/privacy/index?section=data' })">资料处理说明 ↗</button></view
      ><button class="paste-toggle" @click="expandedBP = !expandedBP">
        <text>{{ expandedBP ? '收起正文' : '或者，直接粘贴项目正文' }}</text
        ><text>{{ expandedBP ? '−' : '+' }}</text></button
      ><view v-if="expandedBP">
        <textarea
          v-model="bpText"
          class="bp-input"
          placeholder="目标客户、产品、市场、竞争、收入与成本、团队、融资用途……提供你已有的信息即可。支持文字资料，扫描图片请先转成文字。"
          :maxlength="50000"
          aria-label="BP 正文"
        /><text class="bp-count">{{ bpText.length.toLocaleString() }}/50,000 字</text></view
      ></view
    >

    <view class="field-group"
      ><view class="field-label">今天想听哪种真话</view
      ><view class="tone-options"
        ><button class="tone-card" :class="{ selected: tone === 'sharp' }" @click="tone = 'sharp'">
          <view class="tone-top"><text>✳ 犀利版</text><view class="radio-dot" /></view
          ><text class="tone-description">话不绕弯，直戳商业逻辑</text></button
        ><button
          class="tone-card"
          :class="{ selected: tone === 'balanced' }"
          @click="tone = 'balanced'"
        >
          <view class="tone-top"><text>◈ 专业版</text><view class="radio-dot" /></view
          ><text class="tone-description">冷静拆解，认真给建议</text>
        </button></view
      ></view
    >

    <view class="assigned-panel"
      ><view class="assigned-label"
        ><text class="eyebrow">YOUR COMMITTEE</text
        ><text>{{ currentIndustry.name }} × {{ currentRound.name }}</text></view
      ><view class="panel-people"
        ><view v-for="person in panel" :key="person.id" class="panel-person"
          ><InvestorAvatar :investor="person" small /><view
            ><text class="panel-name">{{ person.name }}</text
            ><text class="panel-title">{{ person.title }}</text></view
          ></view
        ></view
      ><button
        class="panel-customize"
        :aria-expanded="preferenceEditor"
        @click="preferenceEditor = !preferenceEditor"
      >
        <text>已邀请 {{ preferences.length }} / {{ PANEL_SIZE }} 位 · 更换评审偏好</text
        ><text>{{ preferenceEditor ? '−' : '+' }}</text>
      </button>
      <view v-if="preferenceEditor" class="preference-editor">
        <text class="caption">选择三种不同偏好，每位都专注于当前行业和融资轮次。</text>
        <view class="preference-choices">
          <button
            v-for="item in PREFERENCES"
            :key="item.id"
            :class="{ selected: preferences.includes(item.id) }"
            :aria-pressed="preferences.includes(item.id)"
            @click="togglePreference(item.id)"
          >
            {{ preferences.includes(item.id) ? '✓ ' : '' }}{{ item.name }}
          </button>
        </view>
        <text v-if="preferenceError || !panelReady" class="preference-hint">{{
          preferenceError || '请补选至三位教练，再开始评估或查看示例。'
        }}</text>
      </view>
      <button
        class="panel-directory"
        @click="
          uni.navigateTo({ url: `/pages/investors/index?industry=${industry}&round=${round}` })
        "
      >
        认识本领域与轮次的全部 {{ PREFERENCES.length }} 位教练 ↗
      </button>
    </view>

    <button class="consent-row" role="checkbox" :aria-checked="consent" @click="toggleConsent">
      <view class="checkbox" :class="{ checked: consent }">{{ consent ? '✓' : '' }}</view
      ><text
        >我同意将项目资料发送给 DeepSeek，用于生成评估。报告保存在本机，不会自动公开。</text
      ></button
    ><view class="consent-links">
      <button class="privacy-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=ai' })">资料处理与隐私 ↗</button>
      <button class="privacy-link" @click="uni.navigateTo({ url: '/pages/privacy/index?section=terms' })">使用须知 ↗</button>
    </view>
    <view v-if="error" class="error-box" role="alert">{{ error }}</view>
    <button class="primary lime" :disabled="busy || uploading || !panelReady" @click="submit">
      <text>请投委会开场</text><text>↗</text></button
    ><view class="service-status"
      ><view class="service-dot" /><text>{{ availability }}</text></view
    ><button class="demo-link" :disabled="!panelReady" @click="demo">
      先看这组教练的示例报告 →
    </button>
    <BottomNav active="pitch" />

    <view v-if="busy" class="loading-overlay"
      ><view class="loading-card"
        ><view class="loading-orb">✳</view><text class="eyebrow">IN THE INVESTMENT ROOM</text
        ><view class="loading-title">投委会正在审阅。</view
        ><text class="caption"
          >有些问题值得多想一会儿。<br />{{ completed }} / {{ PANEL_SIZE }} 位 AI
          投资人已完成审阅</text
        ><view class="loading-people"
          ><InvestorAvatar v-for="person in panel" :key="person.id" :investor="person" /></view
        ><view class="progress-track"
          ><view
            class="progress-fill"
            :style="{ width: `${(completed / PANEL_SIZE) * 100}%` }" /></view
        ><text class="loading-footnote">通常需要 30–90 秒，请保持页面打开。</text
        ><button class="cancel-button" @click="cancel">取消本次评估</button></view
      ></view
    >
  </view>
</template>

<style scoped>
.panel-customize {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 10px;
  color: #617e4d;
  padding-top: 16px;
}
.preference-editor {
  padding-top: 12px;
}
.preference-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-top: 10px;
}
.preference-choices button {
  padding: 9px 3px;
  font-size: 10px;
  border: 1px solid #d9e0ce;
  border-radius: 8px;
}
.preference-choices button.selected {
  background: #e2ebcf;
  color: #456339;
  border-color: #99ae70;
}
.preference-hint {
  display: block;
  margin-top: 9px;
  font-size: 10px;
  color: #a07844;
}
.panel-directory {
  font-size: 9px;
  color: #8a9a79;
  margin-top: 12px;
  text-align: left;
}
.round-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}
.round-choice {
  padding: 10px 3px;
  background: #fcfcf8;
  border: 1px solid #e0e4d6;
  border-radius: 10px;
  color: #879479;
  font-size: 11px;
}
.round-choice.selected {
  border-color: #a5b977;
  background: #e8efd9;
  color: #456339;
  font-weight: 700;
}
.round-focus {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 11px 12px;
  margin-top: 9px;
  border-radius: 9px;
  background: #eff2e7;
  font-size: 11px;
  color: #71875c;
}
.round-focus-label {
  font-size: 8px;
  color: #9ba88a;
}
.pitch-heading {
  margin: 3px 0 27px;
}
.pitch-heading .eyebrow {
  font-size: 9px;
}
.pitch-title {
  font-size: 31px;
  line-height: 1.55;
  font-weight: 800;
  letter-spacing: -1px;
  margin: 10px 0 10px;
}
.field-group {
  margin-bottom: 23px;
}
.field-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}
.field-counter,
.field-hint {
  color: #989f8e;
  font-weight: 400;
  font-size: 10px;
}
.text-input,
.stage-picker {
  background: #fff;
  border: 1px solid #e0e4d6;
  padding: 14px 15px;
  border-radius: 12px;
  height: 50px;
  font-size: 13px;
}
.text-input {
  width: 100%;
}
.industry-choices {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}
.industry-choice {
  border: 1px solid #e0e4d6;
  border-radius: 10px;
  padding: 10px 0;
  background: #fcfcf8;
  font-size: 11px;
  color: #848d7c;
}
.industry-choice.selected {
  background: #e8efd9;
  border-color: #a5b977;
  color: #456339;
  font-weight: 700;
}
.stage-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.text-link {
  font-size: 10px;
  font-weight: 400;
  color: #6d8a59;
}
.description-input,
.bp-input {
  width: 100%;
  height: 145px;
  font-size: 12px;
  line-height: 1.9;
  padding: 15px;
  background: #fff;
  border: 1px solid #e0e4d6;
  border-radius: 12px;
}
.input-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  color: #a1a792;
  font-size: 9px;
}
.upload-box {
  display: flex;
  align-items: center;
  gap: 13px;
  border: 1px dashed #bdc8a7;
  border-radius: 12px;
  background: #f0f3e7;
  padding: 17px 13px;
  width: 100%;
  text-align: left;
}
.upload-icon {
  font-size: 26px;
  color: #81966a;
}
.upload-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.upload-description {
  display: block;
  color: #929d83;
  font-size: 8px;
  margin-top: 3px;
}
.upload-plus {
  margin-left: auto;
  font-size: 20px;
  color: #8f9e79;
}
.paste-toggle {
  display: flex;
  width: 100%;
  justify-content: space-between;
  padding: 12px 1px 0;
  font-size: 11px;
  color: #8a967b;
}
.bp-input {
  margin-top: 12px;
  height: 180px;
}
.bp-count {
  display: block;
  text-align: right;
  margin-top: 5px;
  font-size: 9px;
  color: #9da58e;
}
.tone-options {
  display: flex;
  gap: 9px;
}
.tone-card {
  flex: 1;
  border: 1px solid #e0e4d6;
  border-radius: 12px;
  padding: 12px;
  background: #fcfcf8;
  text-align: left;
}
.tone-card.selected {
  background: #edf2e2;
  border-color: #a5b977;
}
.tone-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
}
.radio-dot {
  border: 1px solid #ccd3bf;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.selected .radio-dot {
  border: 4px solid #647f48;
}
.tone-description {
  display: block;
  font-size: 9px;
  color: #94a081;
  margin-top: 7px;
}
.assigned-panel {
  border-top: 1px solid #e0e4d6;
  border-bottom: 1px solid #e0e4d6;
  padding: 17px 0;
  margin: 26px 0 20px;
}
.assigned-label {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #8b987b;
  margin-bottom: 14px;
}
.assigned-label .eyebrow {
  font-size: 8px;
}
.panel-people {
  display: flex;
  justify-content: space-between;
  gap: 5px;
}
.panel-person {
  display: flex;
  align-items: center;
  gap: 7px;
}
.panel-name {
  display: block;
  font-size: 11px;
  font-weight: 700;
}
.panel-title {
  display: block;
  color: #8b957f;
  font-size: 8px;
}
.consent-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  font-size: 11px;
  line-height: 1.9;
  color: #627253;
  margin-bottom: 7px;
}
.checkbox {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid #bac6a3;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 10px;
}
.checkbox.checked {
  background: #65834c;
  color: white;
  border-color: #65834c;
}
.consent-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin: 0 0 18px 23px;
}
.privacy-link {
  color: #496c40;
  font-size: 11px;
  min-height: 32px;
  padding: 6px 0;
  text-align: left;
}
.upload-privacy-note {
  font-size: 11px;
  line-height: 1.9;
  color: #69795c;
  margin-top: 9px;
}
.upload-privacy-note button {
  display: inline;
  color: #496c40;
  font-size: 11px;
}
.service-status {
  display: flex;
  justify-content: center;
  gap: 5px;
  align-items: center;
  font-size: 9px;
  color: #96a084;
  margin-top: 11px;
}
.service-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #91a878;
}
.demo-link {
  margin: 16px auto 0;
  font-size: 11px;
  color: #64814b;
  padding: 7px 0;
}
.loading-overlay {
  position: fixed;
  inset: 0;
  background: #1e2b26bb;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  z-index: 99;
}
.loading-card {
  width: 100%;
  max-width: 350px;
  background: #f7f7f0;
  border-radius: 22px;
  padding: 30px 25px 20px;
  text-align: center;
}
.loading-orb {
  font-size: 55px;
  color: #789557;
  margin-bottom: 14px;
  animation: rotate 7s linear infinite;
}
.loading-card .eyebrow {
  font-size: 8px;
}
.loading-title {
  font-size: 23px;
  font-weight: 800;
  margin: 12px 0;
}
.loading-people {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 25px 0;
}
.progress-track {
  height: 4px;
  background: #e4e8da;
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 4px;
  background: #86a85b;
  transition: width 0.5s;
}
.loading-footnote {
  display: block;
  color: #9ba58c;
  font-size: 9px;
  margin-top: 14px;
}
.cancel-button {
  font-size: 11px;
  color: #7a8970;
  margin-top: 22px;
  padding: 7px;
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
