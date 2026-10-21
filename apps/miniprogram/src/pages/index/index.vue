<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import { getIndustry, getPanel, getPreference, getRound } from '@pitchcoach/shared';
import type { IndustryId, RoundId } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import ReviewOfferStatus from '@/components/ReviewOfferStatus.vue';
import { openReviewEntry } from '@/lib/review-entry';
import { useReviewOffer } from '@/lib/review-offer';
import { homeQuestions } from '@/lib/home-questions';
import {
  aboutPath,
  friendShareMessage,
  timelineShareMessage,
  parseShareEntry,
} from '@/lib/share-entry';
const { state, offer, load } = useReviewOffer();
onShow(() => {
  void load();
});
const source = ref('');
const entryIndustry = ref<IndustryId>('ai');
const entryRound = ref<RoundId>('angel');
const previewPanel = computed(() => getPanel(entryIndustry.value, entryRound.value));
const tickerItems = ref(homeQuestions());
const tick = ref(0);
const tickTimer = setInterval(() => {
  tick.value = (tick.value + 1) % tickerItems.value.length;
}, 3400);
onUnmounted(() => clearInterval(tickTimer));
const start = (industry?: IndustryId, round?: RoundId) =>
  openReviewEntry({ industry: industry || entryIndustry.value, round: round || entryRound.value });
onLoad((options) => {
  const safe = parseShareEntry(options);
  source.value = safe.from || '';
  entryIndustry.value = safe.industry || 'ai';
  entryRound.value = safe.round || 'angel';
  if (safe.industry || safe.round || safe.from)
    tickerItems.value = homeQuestions({ industry: entryIndustry.value, round: entryRound.value });
  tick.value = 0;
});
onShareAppMessage(() =>
  friendShareMessage({ industry: entryIndustry.value, round: entryRound.value }),
);
onShareTimeline(() =>
  timelineShareMessage({ industry: entryIndustry.value, round: entryRound.value }),
);
</script>
<template>
  <view class="page home-page">
    <PageHeader />
    <view v-if="source" class="notice referred-note">朋友刚在「{{ getIndustry(entryIndustry).name }} · {{ getRound(entryRound).name }}」接受了 AI 投委会追问，轮到你了。</view>
    <view class="hero">
      <text class="hero-label">✳ 融资前，先听真话</text>
      <view class="hero-title"
        >先被 AI 问倒，<br /><text class="hero-highlight">再去见投资人。</text></view
      >
      <text class="hero-description">把融资难题，变成下一步行动。</text>
      <view class="hero-proof"
        ><text>288 位 AI 投资人</text><text>8 个领域</text><text>6 个轮次</text></view
      >
      <ReviewOfferStatus :state="state" :offer="offer" />
      <button class="primary lime hero-primary" @click="start()">
        {{ source ? `用 ${getIndustry(entryIndustry).shortName} · ${getRound(entryRound).name} 视角开始` : '开始评审我的项目' }} ↗
      </button>
      <button class="secondary hero-secondary" @click="uni.navigateTo({ url: '/pages/investors/index' })">
        先认识 AI 投委会 →
      </button>
      <view class="trust-strip"><text>报告默认私密</text><text>·</text><text>全部失败不计次</text><text>·</text><text>可随时删除</text></view>
      <button v-if="state === 'error'" class="quiet-link" @click="load()">
        重新确认服务与价格 ↻
      </button>
    </view>
    <view class="ticker" aria-live="polite">
      <view class="ticker-head"><text>AI 投委会会这样问你</text><text class="ticker-tag">{{ getIndustry(tickerItems[tick].industry).shortName }} · {{ getRound(tickerItems[tick].round).name }}</text></view>
      <view :key="tick" class="ticker-body">
        <InvestorAvatar :investor="tickerItems[tick]" small />
        <view class="ticker-copy"><text class="ticker-lens">{{ getPreference(tickerItems[tick].preference).name }}视角</text><text class="ticker-question">“{{ tickerItems[tick].question }}”</text><text class="ticker-round-question">{{ getRound(tickerItems[tick].round).name }}还会追问：{{ tickerItems[tick].roundQuestion }}</text></view>
      </view>
      <view class="ticker-dots"><view v-for="(_, index) in tickerItems" :key="index" class="ticker-dot" :class="{ on: index === tick }" /></view>
    </view>
    <view class="how-it-works">
      <view v-for="(item, index) in [
        { icon: '✎', title: '说说项目', sub: '名称加几句话' },
        { icon: '◈', title: '点选视角', sub: '行业 · 轮次 · 阶段' },
        { icon: '✳', title: '拿到报告', sub: '30–90 秒' },
      ]" :key="item.title" class="how-step" :style="{ animationDelay: `${0.25 + index * 0.1}s` }">
        <text class="how-icon">{{ item.icon }}</text><text class="how-title">{{ item.title }}</text><text class="how-sub">{{ item.sub }}</text>
      </view>
    </view>
    <view class="committee-row">
      <view class="committee-people"><view v-for="person in previewPanel" :key="person.id" class="committee-person"><InvestorAvatar :investor="person" small /></view></view>
      <view class="committee-copy"><text class="committee-title">三位 AI 投资人，三种视角</text><text class="committee-sub">按行业与轮次匹配 · AI 角色，非真人</text></view>
      <button class="committee-link" @click="uni.navigateTo({ url: '/pages/investors/index' })">认识 →</button>
    </view>
    <view class="home-trust"
      ><button @click="uni.navigateTo({ url: aboutPath('privacy') })">资料给谁处理</button
      ><text>·</text><button @click="uni.navigateTo({ url: aboutPath('storage') })">报告存在哪</button
      ><text>·</text><button @click="uni.navigateTo({ url: '/pages/privacy/index' })">隐私说明</button></view
    >
    <BottomNav active="home" />
  </view>
</template>
<style scoped>
.hero-proof {
  display: flex;
  gap: 8px;
  margin: 20px 0 16px;
  flex-wrap: wrap;
}
.hero-proof > text {
  font-size: 11px;
  padding: 5px 10px;
  border: 1px solid #dfe5d5;
  border-radius: 25px;
  color: #728468;
  background: #f2f5ea;
}
.hero {
  padding: 2px 0 24px;
}
.hero-label {
  display: block;
  font-size: 12px;
  color: #2f684e;
  margin-bottom: 10px;
}
.hero-title {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.4;
  letter-spacing: -1px;
  margin-bottom: 12px;
}
.hero-highlight {
  background: linear-gradient(transparent 66%, #d9f18a 66%, #d9f18a 92%, transparent 92%);
}
.hero-description {
  display: block;
  font-size: 14px;
  line-height: 1.85;
  color: #626d64;
}
.delivery-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin: 18px 0;
  padding: 14px 0;
  border-top: 1px solid #dfe5d7;
  border-bottom: 1px solid #dfe5d7;
  color: #53704a;
  font-size: 12px;
}
.delivery-strip > view {
  min-width: 0;
}
.delivery-strip > view > text {
  display: block;
}
.delivery-strip > view > text:first-child {
  color: #233c31;
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 3px;
}
.hero-primary {
  margin-top: 16px;
}
.hero-secondary {
  margin-top: 10px;
}
.home-page .quiet-link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  font-size: 12px;
  color: #2f684e;
  width: 100%;
  padding: 8px 0;
}
.referred-note {
  margin: 0 0 16px;
  font-size: 12px;
}
.home-page .preview-link {
  display: block;
  width: 100%;
  color: #d9f18a;
  min-height: 48px;
  text-align: left;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #ffffff25;
  font-size: 13px;
}
.committee-people {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
@media (max-width: 360px) {
  .hero-title {
    font-size: 27px;
  }
  .delivery-strip {
    gap: 4px;
  }
  .delivery-strip > view > text:first-child {
    font-size: 12px;
  }
}
/* ---- refreshed home ---- */
.home-page .hero-title, .home-page .hero-label, .home-page .hero-description { animation: rise .5s cubic-bezier(.2,.8,.2,1) both; }
.home-page .hero-description { animation-delay: .08s; }
.home-page .hero-highlight { background: linear-gradient(#d9f18a, #d9f18a) no-repeat 0 88% / 100% 0.28em; animation: highlight .7s cubic-bezier(.2,.8,.2,1) .35s both; }
@keyframes highlight { from { background-size: 0 0.28em; } }
.home-page .hero-primary { margin-top: 18px; animation: rise .5s ease .15s both, breathe 3.2s ease-in-out 1.2s infinite; }
@keyframes breathe { 50% { box-shadow: 0 0 0 7px #d9f18a55; } }
.ticker { margin-top: 30px; padding: 16px 18px 12px; border-radius: 20px; background: #233b2f; color: #eef4e3; animation: rise .5s ease .2s both; }
.ticker-head { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; font-size: 12px; color: #a9c29d; }
.ticker-tag { padding: 1px 8px; border: 1px solid #a9c29d55; border-radius: 10px; font-size: 11px; }
.ticker-body { display: flex; align-items: flex-start; gap: 12px; min-height: 92px; padding: 14px 0 6px; animation: ticker-in .5s cubic-bezier(.2,.8,.2,1) both; }
@keyframes ticker-in { from { opacity: 0; transform: translateY(14px); } }
.ticker-copy { flex: 1; min-width: 0; }
.ticker-lens { display: block; color: #bcd69f; font-size: 11px; margin-bottom: 5px; }
.ticker-question { display: block; font-size: 16px; font-weight: 700; line-height: 1.7; }
.ticker-round-question { display: block; color: #c2d2b9; font-size: 12px; line-height: 1.7; margin-top: 8px; }
.ticker-dots { display: flex; gap: 5px; justify-content: center; }
.ticker-dot { width: 5px; height: 5px; border-radius: 3px; background: #ffffff33; transition: width .3s, background .3s; }
.ticker-dot.on { width: 16px; background: #d9f18a; }
.how-it-works { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.how-step { display: flex; flex-direction: column; align-items: center; padding: 14px 6px; border-radius: 16px; background: #fff; border: 1px solid #e3e8da; text-align: center; animation: rise .45s ease both; }
.how-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: #e8f0d6; color: #2f684e; font-size: 15px; }
.how-title { font-size: 13px; font-weight: 700; margin-top: 8px; }
.how-sub { font-size: 11px; color: #6a7664; margin-top: 2px; }
.committee-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 14px 16px; border-radius: 16px; background: #edf1e5; }
.committee-row .committee-people { display: flex; flex-shrink: 0; }
.committee-person + .committee-person { margin-left: -8px; }
.committee-copy { flex: 1; min-width: 0; }
.committee-title { display: block; font-size: 13px; font-weight: 700; }
.committee-sub { display: block; font-size: 11px; color: #6a7664; }
.committee-link { flex-shrink: 0; min-height: 44px; font-size: 13px; color: #2f684e; font-weight: 600; }
.home-page .home-trust { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 22px; color: #9aa394; font-size: 12px; }
.home-page .home-trust button { display: inline-flex; align-items: center; width: auto; min-height: 44px; padding: 0 4px; font-size: 12px; color: #5f6f5a; }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .home-page .hero-title, .home-page .hero-label, .home-page .hero-description, .home-page .hero-highlight, .home-page .hero-primary, .ticker, .ticker-body, .how-step { animation: none !important; }
}
.trust-strip { display: flex; justify-content: center; gap: 6px; margin-top: 12px; font-size: 12px; color: #5f6f5a; animation: rise .5s ease .3s both; }
@media (prefers-reduced-motion: reduce) { .trust-strip { animation: none !important; } }
</style>
