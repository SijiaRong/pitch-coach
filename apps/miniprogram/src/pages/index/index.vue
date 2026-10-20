<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { FUNDING_ROUNDS, INDUSTRIES, createDemoReport, getPanel } from '@pitchcoach/shared';
import type { IndustryId, RoundId } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import ReviewOfferStatus from '@/components/ReviewOfferStatus.vue';
import { openReport } from '@/lib/storage';
import { openReviewEntry } from '@/lib/review-entry';
import { useReviewOffer } from '@/lib/review-offer';
import { aboutPath, friendShareMessage, timelineShareMessage, parseShareEntry } from '@/lib/share-entry';
const { state, offer, load } = useReviewOffer();
onShow(() => { void load(); });
const source = ref('');
const entryIndustry = ref<IndustryId>('ai');
const entryRound = ref<RoundId>('angel');
const choicesOpen = ref(false);
const previewPanel = getPanel('ai', 'angel');
const sample = createDemoReport();
const start = (industry?: IndustryId, round?: RoundId) => openReviewEntry({ industry: industry || entryIndustry.value, round: round || entryRound.value });
const demo = () => openReport(createDemoReport(entryIndustry.value, 'sharp', entryRound.value));
onLoad((options) => {
  const safe = parseShareEntry(options);
  source.value = safe.from || '';
  entryIndustry.value = safe.industry || 'ai';
  entryRound.value = safe.round || 'angel';
});
onShareAppMessage(() => friendShareMessage({ industry: entryIndustry.value, round: entryRound.value }));
onShareTimeline(() => timelineShareMessage({ industry: entryIndustry.value, round: entryRound.value }));
</script>
<template>
  <view class="page home-page">
    <PageHeader />
    <view v-if="source" class="notice referred-note">从分享来到这里？先看免费示例，再决定是否评审自己的项目。分享者的报告与BP不会公开。</view>
    <view class="hero">
      <text class="hero-label">✳ 创业项目 · AI 模拟评审</text>
      <view class="hero-title">先被 AI 问倒，<br /><text class="hero-highlight">再去见投资人。</text></view>
      <text class="hero-description">向三位虚构 AI 教练发起评审请求，<br />把难回答的问题，变成下一步行动。</text>
      <view class="delivery-strip"><view><text>三种评审视角</text><text>交叉检查项目</text></view><text>→</text><view><text>风险与追问</text><text>找出证据缺口</text></view><text>→</text><view><text>改进清单</text><text>知道先做什么</text></view></view>
      <ReviewOfferStatus :state="state" :offer="offer" />
      <template v-if="source"><button class="primary lime hero-primary" @click="demo">免费查看示例 ↗</button><button class="secondary hero-secondary" @click="start()">评审我的项目 →</button></template>
      <template v-else><button class="primary lime hero-primary" @click="start()">评审我的项目 ↗</button><button class="secondary hero-secondary" @click="demo">免费查看示例 →</button></template>
      <text class="start-hint">先填写，再确认本次消耗；有额度先用额度</text>
      <button v-if="state === 'error'" class="quiet-link" @click="load()">重新确认服务与价格 ↻</button>
      <button class="quiet-link" @click="uni.navigateTo({ url: aboutPath('billing') })">买到什么、如何计次？ →</button>
    </view>
    <view class="verdict-preview">
      <view class="preview-top"><text>报告不只给分，<br />也告诉你下一步做什么。</text><text class="preview-tag">固定虚构示例</text></view>
      <text class="preview-label">模拟追问</text><text class="preview-question">{{ sample.investors[0].questions[0] }}</text>
      <text class="preview-label">下一步行动</text><text class="preview-action">{{ sample.actions[0].task }}</text>
      <button class="preview-link" @click="demo">免费查看完整示例报告 ↗</button>
    </view>
    <button class="choices-toggle" :aria-expanded="choicesOpen" @click="choicesOpen = !choicesOpen"><view><text class="section-title">按行业与轮次开始</text><text class="caption">想先选好视角，也可以从这里开始</text></view><text>{{ choicesOpen ? '−' : '+' }}</text></button>
    <view v-if="choicesOpen" class="entry-choices"><text class="caption">按行业开始，下一步可调整设置</text><view class="industry-grid"><button v-for="item in INDUSTRIES" :key="item.id" @click="start(item.id)"><text>{{ item.icon }} {{ item.name }}</text><text>{{ item.subtitle }}</text></button></view><text class="caption">按目标轮次开始</text><view class="round-grid"><button v-for="item in FUNDING_ROUNDS" :key="item.id" @click="start(undefined, item.id)">{{ item.name }} ↗</button></view></view>
    <view class="committee-preview"><view class="committee-people"><InvestorAvatar v-for="person in previewPanel" :key="person.id" :investor="person" small /></view><view class="section-title">同一个项目，<br />换三种视角检查。</view><text class="caption">教练均为虚构 AI 角色，反馈仅供路演练习参考。</text><button class="quiet-link" @click="uni.navigateTo({ url: '/pages/investors/index' })">认识 AI 教练与评审偏好 ↗</button></view>
    <view class="home-trust"><button @click="uni.navigateTo({ url: aboutPath('privacy') })">资料会给谁处理？ →</button><button @click="uni.navigateTo({ url: aboutPath('storage') })">报告存在哪里？ →</button><button @click="uni.navigateTo({ url: '/pages/privacy/index' })">隐私与使用说明 →</button></view>
    <BottomNav active="home" />
  </view>
</template>
<style scoped>
.hero { padding: 2px 0 24px; }
.hero-label { display: block; font-size: 12px; color: #2f684e; margin-bottom: 10px; }
.hero-title { font-size: 30px; font-weight: 800; line-height: 1.4; letter-spacing: -1px; margin-bottom: 12px; }
.hero-highlight { background: linear-gradient(transparent 66%, #d9f18a 66%, #d9f18a 92%, transparent 92%); }
.hero-description { display: block; font-size: 14px; line-height: 1.85; color: #626d64; }
.delivery-strip { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 18px 0; padding: 14px 0; border-top: 1px solid #dfe5d7; border-bottom: 1px solid #dfe5d7; color: #53704a; font-size: 12px; }
.delivery-strip > view { min-width: 0; }
.delivery-strip > view > text { display: block; }
.delivery-strip > view > text:first-child { color: #233c31; font-weight: 700; font-size: 13px; margin-bottom: 3px; }
.hero-primary { margin-top: 16px; }
.hero-secondary { margin-top: 10px; }
.start-hint { display: block; text-align: center; color: #626d64; font-size: 12px; margin-top: 10px; line-height: 1.75; }
.home-page .quiet-link { display: flex; align-items: center; justify-content: center; min-height: 44px; font-size: 12px; color: #2f684e; width: 100%; padding: 8px 0; }
.referred-note { margin: 0 0 16px; font-size: 12px; }
.verdict-preview { background: #233c31; color: white; border-radius: 16px; padding: 20px; }
.preview-top { display: flex; justify-content: space-between; gap: 10px; align-items: start; font-size: 18px; font-weight: 700; line-height: 1.5; }
.preview-tag { flex-shrink: 0; font-size: 12px; font-weight: 400; color: #d9f18a; border: 1px solid #728a66; padding: 3px 7px; border-radius: 20px; }
.preview-label { display: block; font-size: 12px; color: #b8cdb6; margin: 20px 0 6px; }
.preview-question { display: block; font-size: 16px; line-height: 1.85; }
.preview-action { display: block; font-size: 14px; line-height: 1.85; color: #e3eacc; }
.home-page .preview-link { display: block; width: 100%; color: #d9f18a; min-height: 48px; text-align: left; margin-top: 16px; padding-top: 12px; border-top: 1px solid #ffffff25; font-size: 13px; }
.home-page .choices-toggle { width: 100%; text-align: left; min-height: 84px; margin-top: 24px; padding: 16px 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1px solid #dfe5d7; }
.choices-toggle > text { font-size: 24px; color: #2f684e; }
.choices-toggle .caption { font-size: 12px; margin-top: 5px; }
.entry-choices { padding-top: 16px; }
.industry-grid, .round-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0 20px; }
.home-page .industry-grid button { min-height: 84px; text-align: left; padding: 13px; background: #fffefa; border: 1px solid #dfe5d7; border-radius: 12px; }
.industry-grid button > text { display: block; font-size: 13px; font-weight: 700; }
.industry-grid button > text:last-child { font-size: 12px; line-height: 1.75; font-weight: 400; color: #626d64; margin-top: 5px; }
.home-page .round-grid button { min-height: 48px; border: 1px solid #dfe5d7; border-radius: 12px; font-size: 13px; background: #edf1e5; }
.committee-preview { margin-top: 24px; padding: 20px; background: #edf1e5; border: 1px solid #dfe5d7; border-radius: 16px; }
.committee-people { display: flex; gap: 10px; margin-bottom: 16px; }
.committee-preview .caption { margin-top: 10px; }
.home-trust { margin-top: 20px; border-top: 1px solid #dfe5d7; }
.home-page .home-trust button { display: block; width: 100%; min-height: 48px; text-align: left; color: #2f684e; font-size: 13px; }
@media(max-width:360px) { .hero-title { font-size: 27px; } .delivery-strip { gap: 4px; } .delivery-strip > view > text:first-child { font-size: 12px; } .preview-top { display: block; } .preview-tag { display: inline-block; margin-top: 10px; } }
</style>
