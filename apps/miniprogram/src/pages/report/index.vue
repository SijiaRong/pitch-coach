<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import {
  INVESTORS,
  VOTE_LABELS,
  decisionLabel,
  getIndustry,
  getPreference,
  getRound,
  publicDiagnosticSummary,
  DEFAULT_PREFERENCES,
} from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import ScoreReveal from '@/components/ScoreReveal.vue';
import RiskDiagnosis from '@/components/RiskDiagnosis.vue';
import ReviewEntryCard from '@/components/ReviewEntryCard.vue';
import CloudSaveStatus from '@/components/CloudSaveStatus.vue';
import { useReviewOffer } from '@/lib/review-offer';
import { openReviewEntry } from '@/lib/review-entry';
import {
  friendShareMessage,
  timelineShareMessage,
  parseShareEntry,
  sharePath,
  aboutPath,
} from '@/lib/share-entry';
const { state: offerState, offer, load: loadOffer } = useReviewOffer();
onShow(() => {
  void loadOffer();
});
import { findReport } from '@/lib/storage';
import {
  drawPoster,
  savePoster,
  POSTER_CANVAS_ID,
  POSTER_ENTRY_HEIGHT,
  posterHeight,
} from '@/lib/poster';
import type { PosterEntry } from '@/lib/poster';
import { findPublication, projectPath } from '@/lib/publication';
import type { PublicationLink } from '@/lib/publication';
import { getProject, projectCodePath, demoCodeEntry } from '@/lib/commerce-api';
import { sharePoster } from '@/lib/share';

const report = ref<EvaluationReport>();
const tab = ref('risks');
const expandedDimension = ref('');
const expandedInvestor = ref('');
const posterOpen = ref(false);
const posterPath = ref('');
const anonymous = ref(true);
const publication = ref<PublicationLink>(),
  entry = ref<PosterEntry>();
const canvasStyle = { height: `${POSTER_ENTRY_HEIGHT}px` };
const previewStyle = computed(() => ({
  height: `${posterHeight(entry.value) * 0.65}px`,
  maxHeight: '54vh',
  width: '195px',
}));
const posterBusy = ref(false);
const saveBusy = ref(false);
const albumPermissionDenied = ref(false);
const posterError = ref('');
const shareHint = ref('在微信图片分享菜单中选择“朋友圈”，发布前仍可确认。');
const shareBusy = ref(false);
const diagnosticSummary = computed(() =>
  report.value ? publicDiagnosticSummary(report.value) : undefined,
);
const industry = computed(() => (report.value ? getIndustry(report.value.industry) : undefined));
const roundName = computed(() => getRound(report.value?.round || 'angel').name);
const firstAction = computed(() => report.value?.actions[0]);
const conclusionExpanded = ref(false);
onLoad((options) => {
  if (options?.share) {
    uni.redirectTo({ url: `/pages/project/index?share=${encodeURIComponent(options.share)}` });
    return;
  }
  if (options?.from !== undefined) {
    const safe = parseShareEntry(options);
    uni.reLaunch({ url: safe.from ? sharePath(safe.from, safe) : '/pages/index/index' });
    return;
  }
  if (options?.id) report.value = findReport(options.id);
  if (report.value) publication.value = findPublication(report.value.id);
  if (options?.publication && report.value && /^[A-Za-z0-9_-]{22}$/.test(options.publication))
    publication.value = {
      reportId: report.value.id,
      projectId: options.publication,
      anonymous: true,
    };
  if (options?.poster === '1') void nextTick().then(() => makePoster());
});
onShow(() => {
  if (report.value) publication.value = findPublication(report.value.id) || publication.value;
});
onShareAppMessage(() => ({
  ...friendShareMessage(report.value),
  ...(publication.value ? { path: projectPath(publication.value) } : {}),
}));
onShareTimeline(() => ({
  ...timelineShareMessage(report.value),
  ...(publication.value && !publication.value.example
    ? { query: `share=${publication.value.projectId}` }
    : {}),
}));
function toolShareFallback() {
  uni.showModal({
    title: '在微信中分享',
    content: publication.value
      ? '分享入口将打开你已确认公开的评估。'
      : '朋友会打开首页，你的报告不会自动公开。',
    showCancel: false,
    confirmText: '知道了',
  });
}

async function makePoster() {
  if (!report.value) return;
  posterOpen.value = true;
  anonymous.value = true;
  if (posterBusy.value) {
    posterPath.value = '';
    return;
  }
  await renderPoster();
}
async function renderPoster() {
  if (!report.value || posterBusy.value) return;
  posterBusy.value = true;
  posterError.value = '';
  albumPermissionDenied.value = false;
  shareHint.value = '在微信图片分享菜单中选择“朋友圈”，发布前仍可确认。';
  posterPath.value = '';
  const drawingAnonymous = anonymous.value;
  await nextTick();
  try {
    if (publication.value && !publication.value.example) {
      await getProject(publication.value.projectId);
      entry.value = { codePath: await projectCodePath(publication.value.projectId) };
    } else if (publication.value?.example) {
      try {
        entry.value = await demoCodeEntry({
          industry: publication.value.example,
          round: publication.value.round || 'angel',
          priceFen: publication.value.priceFen || 8888,
          anonymous: publication.value.anonymous,
          preferences: publication.value.preferences || DEFAULT_PREFERENCES,
          unlockEnabled: publication.value.unlockEnabled,
          tipsEnabled: publication.value.tipsEnabled,
        });
      } catch {
        entry.value = undefined;
        shareHint.value = '示例扫码服务待配置，当前海报不含码。';
      }
    }
    await nextTick();
    const path = await drawPoster(report.value, drawingAnonymous, entry.value);
    if (drawingAnonymous === anonymous.value) posterPath.value = path;
  } catch (cause) {
    posterError.value = cause instanceof Error ? cause.message : '海报生成失败';
  } finally {
    posterBusy.value = false;
    if (drawingAnonymous !== anonymous.value && posterOpen.value) await renderPoster();
  }
}
async function toggleAnonymous() {
  if (posterBusy.value || saveBusy.value || shareBusy.value) return;
  anonymous.value = !anonymous.value;
  await renderPoster();
}
async function save() {
  if (!posterPath.value || saveBusy.value || shareBusy.value) return;
  saveBusy.value = true;
  posterError.value = '';
  albumPermissionDenied.value = false;
  try {
    await savePoster(posterPath.value);
    uni.showToast({ title: '海报已保存', icon: 'success' });
  } catch {
    posterError.value = '海报尚未保存，可以重试或点开大图后长按保存。';
    // #ifdef MP-WEIXIN
    uni.getSetting({
      success: ({ authSetting }) => {
        albumPermissionDenied.value = authSetting['scope.writePhotosAlbum'] === false;
        if (albumPermissionDenied.value)
          posterError.value = '微信尚未获得保存图片权限。可前往设置开启，再点击保存。';
      },
    });
    // #endif
  } finally {
    saveBusy.value = false;
  }
}
function openAlbumSettings() {
  uni.openSetting({
    success: ({ authSetting }) => {
      albumPermissionDenied.value = authSetting['scope.writePhotosAlbum'] !== true;
      if (!albumPermissionDenied.value) {
        posterError.value = '';
        shareHint.value = '相册权限已开启，可以点击“保存图片到本地”。';
      }
    },
  });
}
async function share() {
  if (!posterPath.value || shareBusy.value || saveBusy.value) return;
  shareBusy.value = true;
  posterError.value = '';
  try {
    const result = await sharePoster(
      posterPath.value,
      report.value,
      publication.value && !publication.value.example ? projectPath(publication.value) : undefined,
    );
    if (result === 'preview')
      shareHint.value =
        '当前环境无法打开微信分享菜单，已打开大图预览。请在手机微信中分享；也可使用下方保存图片。';
    if (result === 'opened')
      shareHint.value = '分享菜单已打开，尚不代表发布成功；请在微信中自行选择并确认。';
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
async function showActions() {
  tab.value = 'actions';
  await nextTick();
  uni.pageScrollTo({ selector: '#report-details', duration: 220 });
}
const retry = () =>
  openReviewEntry({
    report: report.value,
    industry: report.value?.industry,
    round: report.value?.round,
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
      <view class="report-name">{{ report.projectName }}</view>
      <text class="report-meta">{{ industry?.name }} · {{ roundName }} · {{ report.stage }} · {{ report.tone === 'sharp' ? '犀利版' : '专业版' }}</text>

      <view class="score-card">
        <view class="score-top">
          <view
            ><ScoreReveal :key="report.id" class="score-number mono" :score="report.score" />
            <text class="score-unit">/ 100</text></view
          >
          <view class="verdict-stamp" :class="report.verdict">{{ decisionLabel(report) }}</view>
        </view>
        <view class="score-meter"><view class="score-meter-fill" :style="{ width: `${report.score ?? 0}%` }" /></view>
        <view class="score-bottom"><text>行业加权参考分</text><text>证据覆盖 {{ report.coverage }}%</text></view>
      </view>
      <view class="verdict-quote"
        ><text class="quote-mark">“</text><text>{{ report.headline }}</text></view
      ><CloudSaveStatus :report="report" /><text v-if="conclusionExpanded" class="report-summary">{{
        report.summary
      }}</text>
      <view class="diagnosis-conclusion" :class="{ blocked: report.diagnostics?.redFlags.length }">
        <text class="diagnosis-counts">{{ diagnosticSummary?.counts }}</text>
        <template v-if="conclusionExpanded"
          ><text class="score-explainer"
            >分数只计算有原文证据的维度，不等于成功概率；资料不足的维度不记为零分。</text
          ><text
            v-for="reason in report.decisionReasons || []"
            :key="reason"
            class="decision-reason"
            >{{ reason }}</text
          ></template
        >
        <button
          class="conclusion-toggle"
          :aria-expanded="conclusionExpanded"
          @click="conclusionExpanded = !conclusionExpanded"
        >
          结论依据 {{ conclusionExpanded ? '−' : '+' }}
        </button>
        <text v-if="!report.diagnostics" class="decision-reason"
          >旧报告尚未完成专项风险检查，建议重新评估。</text
        >
      </view>
      <view v-if="report.missingInvestors.length" class="notice partial-notice"
        >已展示完成的 {{ report.investors.length }} / 3 位结果。{{
          report.mode === 'live'
            ? '本次已计1次；可先使用现有建议补证，新一轮按页面规则计次。'
            : '这是固定虚构示例；真实评审会按实际完成展示。'
        }}</view
      >

      <view v-if="firstAction" class="next-action surface">
        <text class="next-action-label">先做这一件事</text>
        <view class="next-action-title">{{ firstAction.dimension }}</view>
        <text class="next-action-task">{{ firstAction.task }}</text>
        <button class="next-action-link" @click="showActions">查看完整改进清单 →</button>
      </view>

      <view id="report-details" class="report-tabs"
        ><button
          v-for="item in [
            { id: 'risks', label: '风险诊断' },
            { id: 'overview', label: '八维拆解' },
            { id: 'committee', label: '评审追问' },
            { id: 'actions', label: '改进清单' },
          ]"
          :key="item.id"
          :aria-label="`${item.label}${tab === item.id ? '，已选择' : ''}`"
          :class="{ active: tab === item.id }"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button></view
      >
      <view :key="tab" class="tab-pane">
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
          ><text class="model-note">证据覆盖 {{ review.coverage }}% · 模型 {{ review.model }}</text
          ><button
            class="investor-more"
            @click="
              expandedInvestor = expandedInvestor === review.investorId ? '' : review.investorId
            "
          >
            <text>展开追问与待核验风险</text
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
        ><button class="secondary" @click="copyActions">复制我的改进清单 ↗</button></view
      >

      </view>
      <view class="report-disclaimer">{{ report.disclaimer }}</view>
      <ReviewEntryCard :report="report" :state="offerState" :offer="offer" />
      <view class="share-section">
        <view class="share-section-title">觉得有用？分享一下</view>
        <view class="share-row">
          <button hover-class="is-pressed" hover-stay-time="80" class="share-tile" @click="makePoster"><text class="share-icon">▣</text><text>生成海报</text></button>
          <!-- #ifdef MP-WEIXIN -->
          <button hover-class="is-pressed" hover-stay-time="80" class="share-tile" open-type="share"><text class="share-icon">↗</text><text>发给朋友</text></button>
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          <button hover-class="is-pressed" hover-stay-time="80" class="share-tile" @click="toolShareFallback"><text class="share-icon">↗</text><text>发给朋友</text></button>
          <!-- #endif -->
          <button hover-class="is-pressed" hover-stay-time="80"
            class="share-tile"
            @click="
              uni.navigateTo({
                url: publication
                  ? projectPath(publication)
                  : `/pages/publish/index?id=${encodeURIComponent(report.id)}`,
              })
            "
          >
            <text class="share-icon">◎</text><text>{{ publication ? '查看公开页' : '公开报告' }}</text>
          </button>
        </view>
        <button class="share-rules" @click="uni.navigateTo({ url: aboutPath('sharing') })">
          {{ publication ? '已公开；' : '报告默认私密；' }}分享会展示哪些内容？ →
        </button>
      </view>
      <button class="back-home" @click="uni.reLaunch({ url: '/pages/index/index' })">
        ← 回到首页
      </button>

      <canvas
        :id="POSTER_CANVAS_ID"
        :canvas-id="POSTER_CANVAS_ID"
        class="share-canvas"
        :style="canvasStyle"
        :disable-scroll="true"
      />
      <view v-if="posterOpen" class="poster-overlay" @click="posterOpen = false"
        ><view class="poster-dialog" @click.stop
          ><view class="poster-dialog-heading"
            ><text>分享前，先确认内容</text
            ><button aria-label="关闭海报" @click="posterOpen = false">×</button></view
          ><text class="poster-caption">这里只生成预览，分享需在微信中再次确认。</text
          ><view class="poster-preview" :style="previewStyle"
            ><image
              v-if="posterPath"
              :src="posterPath"
              class="poster-image"
              mode="aspectFit"
              @click="uni.previewImage({ urls: [posterPath] })"
            /><view v-if="posterBusy" class="poster-working">正在生成海报…</view>
            <view v-else-if="!posterPath" class="poster-working">海报暂未生成，请重试</view></view
          ><button
            class="anonymous-toggle"
            :disabled="posterBusy || saveBusy || shareBusy"
            @click="toggleAnonymous"
          >
            <text>{{ anonymous ? '☑' : '☐' }} 隐藏项目名称</text
            ><text>{{ anonymous ? '已匿名' : '显示原名称' }}</text></button
          ><text class="privacy-reminder">{{
            anonymous
              ? '项目名称已隐藏，行业、评分与风险概况仍会展示。'
              : '当前会展示项目名称，请确认适合公开。'
          }}</text>
          <view v-if="posterError" class="error-box">{{ posterError }}</view>
          <button
            v-if="!posterBusy && !posterPath"
            class="secondary poster-retry"
            @click="renderPoster"
          >
            重新生成海报
          </button>
          <button
            v-if="albumPermissionDenied"
            class="secondary poster-retry"
            @click="openAlbumSettings"
          >
            打开相册权限设置
          </button>
          <button
            class="primary lime"
            :disabled="posterBusy || shareBusy || saveBusy || !posterPath"
            @click="share"
          >
            {{ shareBusy ? '正在打开分享…' : '分享到朋友圈 ↗' }}</button
          ><text class="poster-caption bottom">{{ shareHint }}</text>
          <button
            class="save-secondary"
            :disabled="posterBusy || saveBusy || shareBusy || !posterPath"
            @click="save"
          >
            {{ saveBusy ? '正在保存…' : '保存图片到本地' }}
          </button>
          <text class="poster-caption bottom">{{
            entry
              ? entry.label?.includes('仅本机')
                ? '演示二维码仅供本机预览。'
                : '扫码查看已授权的完整评估。'
              : '当前为摘要海报，不含完整资料。'
          }}</text>
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
.conclusion-toggle {
  display: block;
  min-height: 39px;
  font-size: 12px;
  color: #6c805d;
  text-align: left;
  width: 100%;
  margin-top: 5px;
}
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
  font-size: 12px;
}
.report-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.report-topline .eyebrow {
  font-size: 12px;
}
.report-topline .pill {
  font-size: 12px;
}
.demo-notice {
  color: #88652e;
  font-size: 12px;
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
  flex-wrap: wrap;
  gap: 8px;
  color: #68785e;
  font-size: 12px;
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
  gap: 12px;
}
.score-number {
  font-size: 64px;
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
  text-align: center;
  line-height: 1.6;
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
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
  font-size: 12px;
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
  font-size: 14px;
  color: #596c53;
  line-height: 1.9;
}
.score-explainer {
  display: block;
  color: #68745f;
  font-size: 12px;
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
  gap: 5px;
  scroll-margin-top: 18px;
}
.report-tabs button {
  font-size: 13px;
  color: #68775e;
  padding: 14px 0;
  min-height: 48px;
  white-space: nowrap;
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
  font-size: 12px;
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
  color: #718063;
  font-size: 12px;
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
  font-size: 12px;
  color: #68775e;
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
  font-size: 12px;
  margin: 9px 0 5px;
  font-weight: 700;
}
.detail-label:first-child {
  margin-top: 0;
}
.detail-text {
  display: block;
  color: #55684e;
  font-size: 14px;
  line-height: 1.9;
}
.evidence {
  display: block;
  font-size: 12px;
  color: #65745b;
  line-height: 1.9;
  border-left: 2px solid #d1dcbf;
  padding-left: 9px;
}
.weight-note {
  font-size: 12px;
  color: #68775e;
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
  min-width: 0;
}
.investor-name {
  display: block;
  font-size: 14px;
  font-weight: 700;
}
.fiction-tag {
  font-size: 12px;
  font-weight: 400;
  color: #718063;
  margin-left: 3px;
}
.investor-role {
  display: block;
  font-size: 12px;
  color: #68775e;
  margin-top: 4px;
  overflow-wrap: anywhere;
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
  font-size: 12px;
  color: #68775e;
}
.investor-quote {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.8;
  margin: 16px 0 9px;
}
.investor-thesis {
  display: block;
  font-size: 14px;
  line-height: 1.9;
  color: #56694f;
}
.model-note {
  display: block;
  font-size: 12px;
  color: #718063;
  margin-top: 12px;
}
.investor-more {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 13px;
  min-height: 48px;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #edf0e7;
  font-size: 12px;
  color: #728a5b;
}
.investor-questions {
  padding-top: 12px;
}
.question {
  display: flex;
  gap: 8px;
  font-size: 14px;
  color: #56694f;
  line-height: 1.9;
  margin-bottom: 8px;
}
.question-index {
  color: #718063;
  font-size: 12px;
  padding-top: 2px;
}
.risk-label {
  margin-top: 15px;
}
.risk-item {
  font-size: 12px;
  color: #806747;
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
  font-size: 14px;
  color: #56694f;
  line-height: 1.9;
}
.actions .secondary {
  margin-top: 22px;
}

.report-disclaimer {
  margin-top: 26px;
  background: #edf0e4;
  color: #68775e;
  border-radius: 10px;
  font-size: 12px;
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
  font-size: 12px;
  color: #68775e;
  margin-top: 10px;
}
.back-home {
  margin: 20px auto 0;
  font-size: 12px;
  color: #859774;
  padding: 8px;
  min-height: 44px;
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
  padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
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
  width: 44px;
  height: 44px;
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
  color: #64745b;
  font-size: 12px;
  margin-top: 6px;
  line-height: 1.8;
}
.poster-caption.bottom {
  text-align: center;
  margin-top: 10px;
}
.poster-preview {
  width: 178px;
  height: 437px;
  max-width: 100%;
  margin: 14px auto 0;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 18px #2633270d;
}
.share-canvas {
  width: 300px;
  height: 736px;
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
  font-size: 12px;
  color: #728a59;
  padding: 14px 0;
  min-height: 48px;
  gap: 10px;
}
.anonymous-toggle text:last-child {
  font-size: 12px;
  color: #68775e;
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
  font-size: 12px;
  font-weight: 700;
}
.decision-reason {
  display: block;
  font-size: 12px;
  color: #68705c;
  line-height: 1.9;
  margin-top: 6px;
}
.save-secondary {
  width: 100%;
  font-size: 12px;
  color: #789061;
  padding: 13px 0;
  min-height: 48px;
}
.next-action {
  margin-top: 22px;
  border-color: #d4dfba;
  background: #eff4e3;
}
.next-action-label {
  color: #4f6b40;
  font-size: 12px;
  font-weight: 700;
}
.next-action-title {
  font-size: 17px;
  font-weight: 700;
  margin: 8px 0;
}
.next-action-task {
  display: block;
  color: #53684b;
  line-height: 1.9;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.next-action-link {
  color: #2f684e;
  font-size: 13px;
  min-height: 44px;
  text-align: left;
  padding-top: 14px;
}
.privacy-reminder {
  display: block;
  margin-bottom: 14px;
  color: #64745b;
  font-size: 12px;
  line-height: 1.8;
}
.poster-retry {
  margin-bottom: 12px;
}
@media (max-width: 360px) {
  .score-card {
    padding: 16px;
  }
  .score-number {
    font-size: 54px;
    letter-spacing: -3px;
  }
  .score-unit {
    margin-left: 5px;
  }
  .verdict-stamp {
    padding: 5px 7px;
    font-size: 13px;
  }
  .investor-heading {
    flex-wrap: wrap;
  }
  .investor-score {
    min-width: 40px;
  }
}
.report-page .share-section {
  border-top: 1px solid #dfe5d7;
  padding-top: 24px;
  margin-top: 24px;
}
.share-section-title {
  font-size: 18px;
  font-weight: 750;
}
.report-page .share-section .share-option {
  margin-top: 12px;
}
.report-page .share-section .share-rules {
  min-height: 44px;
  width: 100%;
  color: #2f684e;
  text-align: left;
  font-size: 12px;
}
.poster-dialog {
  max-height: calc(100vh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  overflow-y: auto;
}
.poster-dialog-heading {
  position: sticky;
  top: -17px;
  background: #f7f7f0;
  z-index: 2;
  padding: 3px 0;
}
/* ---- reveal & motion ---- */
.report-meta { display: block; margin: 4px 0 16px; }
.report-name { animation: rise .45s cubic-bezier(.2,.8,.2,1) both; }
.score-card { position: relative; overflow: hidden; animation: card-in .55s cubic-bezier(.2,.9,.25,1) .05s both; box-shadow: 0 14px 34px #1d33271f; }
.score-card::after { content: ''; position: absolute; top: 0; bottom: 0; width: 40%; left: -60%; background: linear-gradient(100deg, transparent, #ffffff14, transparent); animation: sheen 1.6s ease .5s 1 both; }
@keyframes sheen { to { left: 130%; } }
@keyframes card-in { from { opacity: 0; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: none; } }
.score-number { font-variant-numeric: tabular-nums; }
.score-meter { height: 5px; border-radius: 3px; background: #ffffff14; margin: 2px 0 10px; overflow: hidden; }
.score-meter-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #8fbf5a, #d9f18a); transform-origin: left; animation: meter .9s cubic-bezier(.2,.8,.2,1) .1s both; }
@keyframes meter { from { transform: scaleX(0); } }
.verdict-stamp { animation: stamp .45s cubic-bezier(.3,1.5,.5,1) .7s both; }
@keyframes stamp { from { opacity: 0; transform: scale(1.8) rotate(-12deg); } 60% { opacity: 1; } to { opacity: 1; transform: rotate(-3deg); } }
.verdict-quote { animation: rise .45s ease .8s both; }
.diagnosis-conclusion, .next-action { animation: rise .45s ease .95s both; }
.next-action { border-color: #cfe0b4; box-shadow: 0 8px 24px #2f684e14; }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.report-tabs { position: sticky; top: 0; z-index: 5; background: #f7f7f0; }
.report-tabs button { transition: color .2s; }
.report-tabs button.active::before { animation: tab-line .28s cubic-bezier(.2,.8,.2,1) both; }
@keyframes tab-line { from { transform: scaleX(.2); opacity: 0; } }
.tab-pane { animation: tab-in .32s ease both; }
@keyframes tab-in { from { opacity: 0; transform: translateY(8px); } }
.share-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
.report-page .share-row .share-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 84px; padding: 12px 4px; border-radius: 16px; background: #fff; border: 1px solid #e0e6d6; font-size: 13px; color: #34463a; transition: transform .15s, background .15s; }
.report-page .share-row .share-tile:active { transform: scale(.95); background: #f0f6e6; }
.share-icon { width: 34px; height: 34px; border-radius: 11px; background: #e8f0d6; color: #2f684e; font-size: 16px; display: flex; align-items: center; justify-content: center; }
@media (prefers-reduced-motion: reduce) {
  .report-name, .score-card, .score-card::after, .score-meter-fill, .verdict-stamp, .verdict-quote, .diagnosis-conclusion, .next-action, .report-tabs button.active::before, .tab-pane { animation: none !important; }
  .verdict-stamp { transform: none; }
}
.is-pressed { transform: scale(.97); opacity: .92; }
</style>
