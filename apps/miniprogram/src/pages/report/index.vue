<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import {
  INVESTORS,
  VOTE_LABELS,
  decisionLabel,
  getIndustry,
  getPreference,
  getRound,
  publicDiagnosticSummary,
} from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import RiskDiagnosis from '@/components/RiskDiagnosis.vue';
import { findReport } from '@/lib/storage';
import { drawPoster, savePoster, POSTER_CANVAS_ID } from '@/lib/poster';
import { sharePoster } from '@/lib/share';

const report = ref<EvaluationReport>();
const tab = ref('risks');
const expandedDimension = ref('');
const expandedInvestor = ref('');
const posterOpen = ref(false);
const posterPath = ref('');
const anonymous = ref(true);
const posterBusy = ref(false);
const posterError = ref('');
const shareHint = ref('在微信图片分享菜单中选择“朋友圈”，发布前仍可确认。');
const shareBusy = ref(false);
const diagnosticSummary = computed(() =>
  report.value ? publicDiagnosticSummary(report.value) : undefined,
);
const industry = computed(() => (report.value ? getIndustry(report.value.industry) : undefined));
const roundName = computed(() => getRound(report.value?.round || 'angel').name);

onLoad((options) => {
  if (options?.from === 'timeline' && !options.id) {
    uni.reLaunch({ url: '/pages/index/index' });
    return;
  }
  if (options?.id) report.value = findReport(options.id);
});
onShareAppMessage(() => ({
  title: '你的项目，敢让 AI 投委会看一眼吗？',
  path: '/pages/index/index',
}));
onShareTimeline(() => ({ title: '先被 AI 问倒，再去见投资人。', query: 'from=timeline' }));

async function makePoster() {
  if (!report.value) return;
  posterOpen.value = true;
  posterBusy.value = true;
  posterError.value = '';
  shareHint.value = '在微信图片分享菜单中选择“朋友圈”，发布前仍可确认。';
  posterPath.value = '';
  await nextTick();
  try {
    posterPath.value = await drawPoster(report.value, anonymous.value);
  } catch (cause) {
    posterError.value = cause instanceof Error ? cause.message : '海报生成失败';
  } finally {
    posterBusy.value = false;
  }
}
async function toggleAnonymous() {
  anonymous.value = !anonymous.value;
  await makePoster();
}
async function save() {
  if (!posterPath.value) return;
  try {
    await savePoster(posterPath.value);
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch (cause) {
    posterError.value = cause instanceof Error ? cause.message : '保存失败';
  }
}
async function share() {
  if (!posterPath.value || shareBusy.value) return;
  shareBusy.value = true;
  posterError.value = '';
  try {
    const result = await sharePoster(posterPath.value);
    if (result === 'preview')
      shareHint.value =
        '当前环境无法打开微信分享菜单，已打开大图预览。请在手机微信中分享；也可使用下方保存图片。';
    if (result === 'opened') shareHint.value = '请选择“朋友圈”。若菜单没有此项，请更新微信后重试。';
    if (result === 'cancelled') shareHint.value = '已取消分享，海报仍在这里。';
  } catch (cause) {
    posterError.value = cause instanceof Error ? cause.message : '分享菜单暂不可用';
  } finally {
    shareBusy.value = false;
  }
}
function copyActions() {
  if (!report.value) return;
  const content = report.value.actions
    .map((action) => `${action.priority}. ${action.dimension}：${action.task}`)
    .join('\n');
  uni.setClipboardData({
    data: `${report.value.projectName} · 融资改进清单\n${content}\n\n${report.value.mode === 'demo' ? '虚构演示，非真实项目评估。' : 'AI 生成内容，请核验。'}\n${report.value.disclaimer}`,
  });
}
const retry = () =>
  uni.reLaunch({
    url: `/pages/pitch/index?industry=${report.value?.industry || 'ai'}&round=${report.value?.round || 'angel'}${report.value?.preferences ? `&preferences=${report.value.preferences.join(',')}` : ''}`,
  });
</script>

<template>
  <view class="page report-page compact">
    <PageHeader back label="项目评估" />
    <template v-if="report">
      <view class="report-topline"
        ><text class="eyebrow">THE INVESTMENT MEMO</text
        ><view class="pill" :class="{ demo: report.mode === 'demo' }">{{
          report.mode === 'demo' ? 'DEMO · 演示报告' : 'AI 生成 · 模拟评估'
        }}</view></view
      >
      <view v-if="report.mode === 'demo'" class="demo-notice"
        >本报告为虚构项目与固定演示评分，未调用 AI。</view
      >
      <view class="report-name">{{ report.projectName }}</view
      ><view class="report-meta"
        ><text>{{ industry?.name }}</text
        ><text> / </text><text>{{ roundName }}</text
        ><text> / </text><text>{{ report.stage }}</text
        ><text> / </text><text>{{ report.tone === 'sharp' ? '犀利版' : '专业版' }}</text></view
      >

      <view v-if="report.preferences" class="report-preferences"
        ><text v-for="preference in report.preferences" :key="preference">{{
          getPreference(preference).name
        }}</text></view
      >

      <view class="score-card"
        ><view class="score-top"
          ><view
            ><text class="score-number mono">{{ report.score ?? '—' }}</text
            ><text class="score-unit">/ 100</text></view
          ><view class="verdict-stamp" :class="report.verdict">{{
            decisionLabel(report)
          }}</view></view
        ><view class="score-bottom"
          ><text>行业加权参考分</text><text>证据覆盖 {{ report.coverage }}%</text></view
        ></view
      >
      <view class="verdict-quote"
        ><text class="quote-mark">“</text><text>{{ report.headline }}</text></view
      ><text class="report-summary">{{ report.summary }}</text>
      <view class="diagnosis-conclusion" :class="{ blocked: report.diagnostics?.redFlags.length }">
        <text class="diagnosis-counts">{{ diagnosticSummary?.counts }}</text>
        <text
          v-for="reason in report.decisionReasons || []"
          :key="reason"
          class="decision-reason"
          >{{ reason }}</text
        >
        <text v-if="!report.diagnostics" class="decision-reason"
          >旧报告尚未完成专项风险检查，建议重新评估。</text
        >
      </view>
      <button class="secondary conclusion-share" @click="makePoster">
        把这份诊断分享到朋友圈 ↗
      </button>
      <view v-if="report.missingInvestors.length" class="notice partial-notice"
        >部分投资人未完成审阅：{{
          report.missingInvestors.map((id) => INVESTORS[id]?.name || id).join('、')
        }}。当前结果为部分评审，建议稍后重新评估。</view
      >
      <text class="score-explainer"
        >分数只计算有原文证据的维度，不等于项目成功概率。资料不足的维度不记为零分。</text
      >

      <view class="report-tabs"
        ><button
          v-for="item in [
            { id: 'risks', label: '风险诊断' },
            { id: 'overview', label: '八维拆解' },
            { id: 'committee', label: '投委会发言' },
            { id: 'actions', label: '下一步做什么' },
          ]"
          :key="item.id"
          :class="{ active: tab === item.id }"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button></view
      >
      <RiskDiagnosis v-if="tab === 'risks'" :diagnostics="report.diagnostics" />

      <view v-if="tab === 'overview'" class="dimensions"
        ><text class="caption dimension-tip">点开每个维度，看依据和改进建议。</text
        ><view v-for="dimension in report.dimensions" :key="dimension.id" class="dimension-block"
          ><button
            class="dimension-row"
            @click="expandedDimension = expandedDimension === dimension.id ? '' : dimension.id"
          >
            <view class="dimension-label"
              ><text>{{ dimension.name }}</text
              ><text class="dimension-weight">权重 {{ dimension.weight }}%</text></view
            ><view class="dimension-bar"
              ><view
                v-if="dimension.score !== null"
                class="dimension-fill"
                :class="{ weak: dimension.score < 60 }"
                :style="{ width: `${dimension.score}%` }" /></view
            ><text class="dimension-score" :class="{ missing: dimension.score === null }">{{
              dimension.score ?? '待补'
            }}</text
            ><text class="dimension-chevron">{{
              expandedDimension === dimension.id ? '−' : '+'
            }}</text></button
          ><view v-if="expandedDimension === dimension.id" class="dimension-details"
            ><text class="detail-label">评审意见</text
            ><text class="detail-text">{{ dimension.reason }}</text
            ><template v-if="dimension.evidence"
              ><text class="detail-label">资料原文 · 未经独立核实</text
              ><text class="evidence">“{{ dimension.evidence }}”</text></template
            ><text class="detail-label">如何改进</text
            ><text class="detail-text">{{ dimension.action }}</text></view
          ></view
        ><view class="weight-note"
          ><text>行业权重随赛道变化。多人意见取平均分，单项解释展示更审慎的判断。</text></view
        ></view
      >

      <view v-if="tab === 'committee'" class="investor-reviews"
        ><view
          v-for="review in report.investors"
          :key="review.investorId"
          class="investor-review surface"
          ><view class="investor-heading"
            ><InvestorAvatar :investor="INVESTORS[review.investorId]" /><view class="investor-info"
              ><text class="investor-name"
                >{{ INVESTORS[review.investorId].name }}
                <text class="fiction-tag">虚构 AI</text></text
              ><text class="investor-role">{{ INVESTORS[review.investorId].title }}</text></view
            ><view class="investor-score"
              ><text class="mono">{{ review.score ?? '—' }}</text
              ><text class="investor-vote">{{ VOTE_LABELS[review.vote] }}</text></view
            ></view
          ><view class="investor-quote">“{{ review.oneLiner }}”</view
          ><text class="investor-thesis">{{ review.thesis }}</text
          ><text class="model-note">模型：{{ review.model }} · 证据覆盖 {{ review.coverage }}%</text
          ><button
            class="investor-more"
            @click="
              expandedInvestor = expandedInvestor === review.investorId ? '' : review.investorId
            "
          >
            <text>他还想问你的问题</text
            ><text>{{ expandedInvestor === review.investorId ? '−' : '+' }}</text></button
          ><view v-if="expandedInvestor === review.investorId" class="investor-questions"
            ><view v-for="(question, index) in review.questions" :key="question" class="question"
              ><text class="question-index">0{{ index + 1 }}</text
              ><text>{{ question }}</text></view
            ><text class="detail-label risk-label">需要核验的风险</text
            ><view v-for="risk in review.risks" :key="risk" class="risk-item"
              >· {{ risk }}</view
            ></view
          ></view
        ></view
      >

      <view v-if="tab === 'actions'" class="actions"
        ><view class="action-intro"
          ><view class="action-title">别只收藏，去验证。</view
          ><text class="caption">先补证据，再改故事。按优先级做这几件事。</text></view
        ><view v-for="action in report.actions" :key="action.priority" class="action-card"
          ><text class="action-number mono">0{{ action.priority }}</text
          ><view
            ><view class="action-dimension">{{ action.dimension }}</view
            ><text class="action-task">{{ action.task }}</text></view
          ></view
        ><button class="secondary" @click="copyActions">复制我的改进清单 ↗</button
        ><button class="retry-link" @click="retry">补齐资料，再评一次 →</button></view
      >

      <view class="report-disclaimer">{{ report.disclaimer }}</view>
      <button class="primary lime poster-cta" @click="makePoster">
        <text>把这份诊断分享到朋友圈</text><text>↗</text></button
      ><text class="share-note">先预览，再分享。默认隐藏项目名称。</text
      ><button class="back-home" @click="uni.reLaunch({ url: '/pages/index/index' })">
        ← 返回融资教练
      </button>

      <view v-if="posterOpen" class="poster-overlay"
        ><view class="poster-dialog"
          ><view class="poster-dialog-heading"
            ><text>给朋友圈，一份真话。</text
            ><button :disabled="posterBusy" aria-label="关闭海报" @click="posterOpen = false">
              ×
            </button></view
          ><text class="poster-caption">红橙旗、死亡预言、未验假设，一起带上。确认后分享。</text
          ><view class="poster-preview"
            ><canvas
              :id="POSTER_CANVAS_ID"
              :canvas-id="POSTER_CANVAS_ID"
              class="share-canvas"
              :disable-scroll="true"
            /><image
              v-if="posterPath"
              :src="posterPath"
              class="poster-image"
              mode="aspectFit"
              @click="uni.previewImage({ urls: [posterPath] })"
            /><view v-if="posterBusy" class="poster-working">正在生成海报…</view></view
          ><button class="anonymous-toggle" :disabled="posterBusy" @click="toggleAnonymous">
            <text>{{ anonymous ? '☑' : '☐' }} 隐藏项目名称</text
            ><text>{{ anonymous ? '已匿名' : '显示原名称' }}</text></button
          ><view v-if="posterError" class="error-box">{{ posterError }}</view
          ><button
            class="primary lime"
            :disabled="posterBusy || shareBusy || !posterPath"
            @click="share"
          >
            {{ shareBusy ? '正在打开分享…' : '分享到朋友圈 ↗' }}</button
          ><text class="poster-caption bottom">{{ shareHint }}</text>
          <button class="save-secondary" :disabled="posterBusy || !posterPath" @click="save">
            保存图片到本地
          </button>
          <text class="poster-caption bottom"
            >海报仅含风险类别与条件性情景；BP 原文、客户与金额不进入画面。</text
          >
        </view></view
      >
    </template>
    <view v-else class="empty-state"
      ><view class="empty-icon">◇</view><view class="empty-title">这份报告不在本机。</view
      ><view class="empty-description"
        >报告仅保存在生成它的设备上。<br />你可以为自己的项目发起一次评估。</view
      ><button class="primary lime" @click="retry">去评估我的项目 ↗</button></view
    >
  </view>
</template>

<style scoped>
.report-preferences {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: -7px 0 18px;
}
.report-preferences text {
  color: #738b58;
  background: #edf1e3;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 9px;
}
.report-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.report-topline .eyebrow {
  font-size: 8px;
}
.report-topline .pill {
  font-size: 8px;
}
.demo-notice {
  color: #a3814e;
  font-size: 9px;
  margin: 13px 0 0;
  background: #f4eedd;
  padding: 7px 10px;
  border-radius: 7px;
}
.report-name {
  font-size: 29px;
  font-weight: 800;
  margin-top: 18px;
  letter-spacing: -1px;
  overflow-wrap: anywhere;
}
.report-meta {
  display: flex;
  gap: 8px;
  color: #8f9b80;
  font-size: 10px;
  margin: 4px 0 19px;
}
.score-card {
  background: #263e32;
  color: #d9f18a;
  border-radius: 16px;
  padding: 16px 22px 15px;
}
.score-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.score-number {
  font-size: 76px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -6px;
}
.score-unit {
  font-size: 13px;
  color: #8eaa8d;
  margin-left: 12px;
}
.verdict-stamp {
  color: #d9e3b6;
  border: 1px solid #9cad7877;
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 600;
  transform: rotate(7deg);
  letter-spacing: 2px;
}
.verdict-stamp.pass {
  color: #e5c39e;
  border-color: #c39c6d77;
}
.verdict-stamp.invest {
  color: #d9f18a;
}
.score-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  color: #96ad91;
  padding-top: 8px;
  border-top: 1px solid #ffffff12;
}
.verdict-quote {
  position: relative;
  font-weight: 750;
  font-size: 24px;
  line-height: 1.65;
  margin: 28px 0 14px;
  letter-spacing: -0.5px;
  padding-left: 2px;
}
.quote-mark {
  position: absolute;
  font-family: Georgia, serif;
  font-size: 65px;
  top: -28px;
  left: -2px;
  color: #dce5cb;
  z-index: 0;
  opacity: 0.8;
}
.verdict-quote > text:last-child {
  position: relative;
}
.report-summary {
  display: block;
  font-size: 11px;
  color: #7f8b72;
  line-height: 1.9;
}
.score-explainer {
  display: block;
  color: #a2aa95;
  font-size: 9px;
  line-height: 1.8;
  margin-top: 10px;
}
.partial-notice {
  margin-top: 15px;
}
.report-tabs {
  display: flex;
  border-bottom: 1px solid #dfe5d4;
  margin: 27px 0 15px;
  gap: 15px;
}
.report-tabs button {
  font-size: 12px;
  color: #96a084;
  padding: 10px 0;
  position: relative;
  flex: 1;
  text-align: center;
}
.report-tabs button.active {
  color: #355a3d;
  font-weight: 700;
}
.report-tabs button.active::before {
  content: '';
  position: absolute;
  height: 2px;
  background: #65874a;
  bottom: -1px;
  left: 10%;
  right: 10%;
}
.dimension-tip {
  font-size: 9px;
  margin: 0 0 10px;
}
.dimension-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  padding: 13px 0;
  text-align: left;
}
.dimension-label {
  min-width: 58px;
  font-size: 12px;
}
.dimension-weight {
  display: block;
  color: #a1ab92;
  font-size: 8px;
  margin-top: 2px;
}
.dimension-bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: #e6e9dd;
  overflow: hidden;
}
.dimension-fill {
  height: 100%;
  background: #91ad64;
  border-radius: 3px;
}
.dimension-fill.weak {
  background: #c4ad84;
}
.dimension-score {
  font-size: 15px;
  font-family: Consolas, monospace;
  width: 28px;
  text-align: right;
  color: #5e7c45;
}
.dimension-score.missing {
  font-family: inherit;
  font-size: 10px;
  color: #a7ae99;
}
.dimension-chevron {
  color: #98a487;
  width: 8px;
  font-size: 13px;
}
.dimension-details {
  padding: 12px 14px 17px;
  background: #eff2e7;
  border-radius: 10px;
  margin-bottom: 6px;
}
.detail-label {
  display: block;
  color: #6b8257;
  font-size: 9px;
  margin: 9px 0 5px;
  font-weight: 700;
}
.detail-label:first-child {
  margin-top: 0;
}
.detail-text {
  display: block;
  color: #7c8a6e;
  font-size: 11px;
  line-height: 1.9;
}
.evidence {
  display: block;
  font-size: 10px;
  color: #97a089;
  line-height: 1.9;
  border-left: 2px solid #d1dcbf;
  padding-left: 9px;
}
.weight-note {
  font-size: 9px;
  color: #9da68e;
  line-height: 1.8;
  border-top: 1px solid #e2e6d7;
  padding-top: 13px;
  margin-top: 9px;
}
.investor-review {
  margin-bottom: 12px;
  padding: 17px;
}
.investor-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.investor-info {
  flex: 1;
}
.investor-name {
  display: block;
  font-size: 14px;
  font-weight: 700;
}
.fiction-tag {
  font-size: 8px;
  font-weight: 400;
  color: #a3ab96;
  margin-left: 3px;
}
.investor-role {
  display: block;
  font-size: 9px;
  color: #95a086;
  margin-top: 4px;
}
.investor-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.investor-score .mono {
  font-size: 22px;
  color: #618048;
}
.investor-vote {
  font-size: 8px;
  color: #98a087;
}
.investor-quote {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.8;
  margin: 16px 0 9px;
}
.investor-thesis {
  display: block;
  font-size: 11px;
  line-height: 1.9;
  color: #89957a;
}
.model-note {
  display: block;
  font-size: 8px;
  color: #a3ae94;
  margin-top: 12px;
}
.investor-more {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid #edf0e7;
  font-size: 10px;
  color: #728a5b;
}
.investor-questions {
  padding-top: 12px;
}
.question {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #869376;
  line-height: 1.9;
  margin-bottom: 8px;
}
.question-index {
  color: #b1bca0;
  font-size: 9px;
  padding-top: 2px;
}
.risk-label {
  margin-top: 15px;
}
.risk-item {
  font-size: 10px;
  color: #a59377;
  line-height: 1.9;
  margin-bottom: 5px;
}
.action-intro {
  padding: 8px 0 5px;
}
.action-title {
  font-size: 22px;
  font-weight: 750;
  margin-bottom: 6px;
}
.action-card {
  display: flex;
  gap: 17px;
  border-bottom: 1px solid #e2e7d7;
  padding: 21px 0;
}
.action-number {
  font-size: 26px;
  color: #c1cdae;
  line-height: 1.3;
}
.action-dimension {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 7px;
}
.action-task {
  display: block;
  font-size: 11px;
  color: #89967b;
  line-height: 1.9;
}
.actions .secondary {
  margin-top: 22px;
}
.retry-link {
  color: #69884d;
  margin: 15px auto 0;
  padding: 8px;
  font-size: 12px;
}
.report-disclaimer {
  margin-top: 26px;
  background: #edf0e4;
  color: #96a185;
  border-radius: 10px;
  font-size: 9px;
  padding: 13px;
  line-height: 1.9;
}
.poster-cta {
  font-size: 12px;
  margin-top: 20px;
}
.share-note {
  display: block;
  text-align: center;
  font-size: 9px;
  color: #a0aa8e;
  margin-top: 10px;
}
.back-home {
  margin: 20px auto 0;
  font-size: 11px;
  color: #859774;
  padding: 8px;
}
.poster-overlay {
  position: fixed;
  inset: 0;
  background: #1c2b22c9;
  z-index: 99;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: max(24px, env(safe-area-inset-top)) 18px 24px;
}
.poster-dialog {
  width: 100%;
  max-width: 350px;
  background: #f7f7f0;
  border-radius: 18px;
  padding: 17px;
}
.poster-dialog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 700;
}
.poster-dialog-heading button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  font-size: 23px;
  line-height: 1;
}
/* #ifdef MP-WEIXIN */
.poster-overlay {
  padding-top: calc(var(--status-bar-height, 0px) + 56px);
}
/* #endif */
.poster-caption {
  display: block;
  color: #98a189;
  font-size: 9px;
  margin-top: 6px;
}
.poster-caption.bottom {
  text-align: center;
  margin-top: 10px;
}
.poster-preview {
  width: 225px;
  height: 510px;
  max-width: 100%;
  margin: 14px auto 0;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 18px #2633270d;
}
.share-canvas {
  width: 300px;
  height: 680px;
  position: fixed;
  left: -1000px;
  top: 0;
}
.poster-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.poster-working {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f1f3e8;
  font-size: 12px;
  color: #82936e;
}
.anonymous-toggle {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 11px;
  color: #728a59;
  padding: 14px 0;
}
.anonymous-toggle text:last-child {
  font-size: 9px;
  color: #a5ad95;
}
.diagnosis-conclusion {
  padding: 14px 15px;
  border-radius: 10px;
  background: #edf0e2;
  margin: 15px 0 11px;
}
.diagnosis-conclusion.blocked {
  background: #f7ebe4;
  border-left: 3px solid #b35a4a;
}
.diagnosis-counts {
  display: block;
  color: #536c49;
  font-size: 11px;
  font-weight: 700;
}
.decision-reason {
  display: block;
  font-size: 10px;
  color: #7d866f;
  line-height: 1.9;
  margin-top: 6px;
}
.conclusion-share {
  font-size: 11px;
}
.save-secondary {
  width: 100%;
  font-size: 11px;
  color: #789061;
  padding: 13px 0 3px;
}
</style>
