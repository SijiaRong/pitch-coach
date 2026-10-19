<script setup lang="ts">
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import {
  FUNDING_ROUNDS,
  INDUSTRIES,
  INVESTOR_ROSTER,
  PREFERENCES,
  createDemoReport,
  getPanel,
} from '@pitchcoach/shared';
import type { IndustryId, RoundId } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import { openReport } from '@/lib/storage';

const start = (industry?: IndustryId, round?: RoundId) =>
  uni.reLaunch({
    url: `/pages/pitch/index?industry=${industry || 'ai'}&round=${round || 'angel'}`,
  });
const demo = () => openReport(createDemoReport());
const previewPanel = getPanel('ai', 'angel');
const previewInvestor = previewPanel.find((investor) => investor.preference === 'financial')!;
const investors = () => uni.navigateTo({ url: '/pages/investors/index' });
onShareAppMessage(() => ({
  title: '你的项目，敢让 AI 投委会看一眼吗？',
  path: '/pages/index/index',
}));
onShareTimeline(() => ({ title: '先被 AI 问倒，再去见投资人。' }));
</script>

<template>
  <view class="page home-page">
    <PageHeader />
    <view class="hero">
      <view class="hero-label"
        ><view class="tiny-star">✳</view><text>创业者的融资前压力测试</text></view
      >
      <view class="hero-title"
        >先被 AI 问倒，<br /><text class="hero-highlight">再去见投资人。</text></view
      >
      <text class="hero-description"
        >少一点自我感动，多一点投资人视角。<br />把你的项目，放到真正的问题面前。</text
      >
      <view class="hero-meta"
        ><text>8 个行业</text><text class="meta-dot">·</text><text>6 个融资轮次</text
        ><text class="meta-dot">·</text><text>{{ INVESTOR_ROSTER.length }} 位 AI 投资人</text></view
      >
    </view>

    <button class="verdict-preview" aria-label="查看示例评估报告" @click="demo">
      <view class="preview-top"
        ><text class="preview-label">THE INVESTMENT MEMO</text
        ><view class="preview-tag">示例报告 ↗</view></view
      >
      <view class="preview-body"
        ><view class="preview-quote">“{{ previewInvestor.opening }}”</view
        ><view class="stamp">再<br />打磨</view></view
      >
      <view class="preview-divider" />
      <view class="preview-bottom"
        ><view class="preview-avatar">{{ previewInvestor.mark }}</view
        ><view class="preview-investor"
          ><text>{{ previewInvestor.name }}</text
          ><text class="preview-investor-title"
            >{{ previewInvestor.title }} · 虚构 AI 投资人</text
          ></view
        ><text class="preview-arrow">↗</text></view
      >
      <view class="preview-orbit" />
    </button>

    <button class="primary lime start-button" @click="start()">
      <text>把项目交给投委会</text><text class="button-arrow">↗</text>
    </button>
    <text class="start-hint">说清你在做什么。剩下的，交给提问。</text>
    <button class="coach-roster-link" @click="investors">
      {{ FUNDING_ROUNDS.length }} 轮 × {{ INDUSTRIES.length }} 领域 × {{ PREFERENCES.length }} 偏好
      · 每场匹配 3 位专项教练 ↗
    </button>

    <view class="section-head"
      ><view
        ><text class="eyebrow">PICK YOUR ARENA</text
        ><text class="section-title">不同行业，不同审法。</text></view
      ><text class="section-side">找到你的主场 ↓</text></view
    >
    <view class="industry-grid">
      <button
        v-for="industry in INDUSTRIES"
        :key="industry.id"
        class="industry-card"
        @click="start(industry.id)"
      >
        <view class="industry-top"
          ><view class="industry-symbol" :class="industry.color">{{ industry.icon }}</view
          ><text class="industry-arrow">↗</text></view
        >
        <text class="industry-name">{{ industry.name }}</text
        ><text class="industry-subtitle">{{ industry.subtitle }}</text>
      </button>
    </view>

    <view class="section-head"
      ><view
        ><text class="eyebrow">RIGHT COACH. RIGHT ROUND.</text
        ><text class="section-title">每一轮，都有自己的难题。</text></view
      ></view
    >
    <view class="round-grid"
      ><button
        v-for="item in FUNDING_ROUNDS"
        :key="item.id"
        class="round-tile"
        @click="start(undefined, item.id)"
      >
        <text class="round-name">{{ item.name }} ↗</text
        ><text class="round-question">{{ item.question }}</text>
      </button></view
    >
    <view class="section-head committee-heading"
      ><view
        ><text class="eyebrow">MEET YOUR COMMITTEE</text
        ><text class="section-title">有人看远方，有人翻账本。</text></view
      ><button class="link" @click="investors">认识他们 ↗</button></view
    >
    <view class="committee-preview">
      <view v-for="person in previewPanel" :key="person.id" class="committee-person"
        ><InvestorAvatar :investor="person" /><text class="person-name">{{ person.name }}</text
        ><text class="person-title">{{ person.title }}</text></view
      >
    </view>
    <view class="philosophy"
      ><text class="philosophy-star">✳</text
      ><view
        ><text class="philosophy-title">犀利，是为了让项目变好。</text
        ><text class="caption"
          >每一句质疑，都应该接着一个能行动的建议。<br />所有角色均为虚构 AI
          投资人，评估仅供项目自检。</text
        ></view
      ></view
    >
    <button class="about-link" @click="uni.navigateTo({ url: '/pages/about/index' })">
      关于 · 评分规则 · 隐私与使用说明 ↗
    </button>
    <BottomNav active="home" />
  </view>
</template>

<style scoped>
.coach-roster-link {
  font-size: 10px;
  color: #688454;
  margin: 16px auto 0;
  line-height: 1.8;
}
.round-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.round-tile {
  text-align: left;
  background: #eef1e5;
  border-radius: 12px;
  padding: 14px;
}
.round-name {
  display: block;
  font-size: 12px;
  color: #60774b;
  font-weight: 700;
}
.round-question {
  display: block;
  font-size: 9px;
  color: #97a487;
  margin-top: 6px;
  line-height: 1.8;
}
.hero {
  padding: 6px 0 25px;
}
.hero-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #5e7458;
  letter-spacing: 1px;
  margin-bottom: 16px;
}
.tiny-star {
  font-size: 20px;
  line-height: 1;
  color: #70904e;
}
.hero-title {
  font-size: 35px;
  font-weight: 800;
  line-height: 1.48;
  letter-spacing: -1.7px;
  margin-bottom: 15px;
}
.hero-highlight {
  background: linear-gradient(transparent 66%, #d9f18a 66%, #d9f18a 92%, transparent 92%);
}
.hero-description {
  display: block;
  color: #808679;
  font-size: 12px;
  line-height: 1.95;
  letter-spacing: 0.3px;
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 21px;
  font-size: 10px;
  color: #5c6658;
}
.meta-dot {
  color: #b3b9a5;
}
.verdict-preview {
  position: relative;
  overflow: hidden;
  text-align: left;
  background: #233c31;
  color: #fff;
  border-radius: 18px;
  padding: 21px;
  width: 100%;
}
.preview-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 2;
}
.preview-label {
  color: #b5c8a8;
  letter-spacing: 1.4px;
  font-size: 8px;
  font-weight: 600;
}
.preview-tag {
  border: 1px solid #6f8a705c;
  color: #c3d3ba;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 9px;
}
.preview-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 21px 0 23px;
  position: relative;
  z-index: 2;
}
.preview-quote {
  font-size: 23px;
  line-height: 1.65;
  letter-spacing: 1px;
  font-weight: 600;
}
.stamp {
  font-family: 'Songti SC', serif;
  color: #d8e6b5;
  border: 1px solid #b2cd8566;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 17px;
  line-height: 1.3;
  transform: rotate(10deg);
  margin-right: 7px;
  letter-spacing: 2px;
}
.preview-divider {
  height: 1px;
  background: #ffffff19;
}
.preview-bottom {
  display: flex;
  align-items: center;
  padding-top: 14px;
  gap: 9px;
  position: relative;
  z-index: 2;
}
.preview-avatar {
  width: 29px;
  height: 29px;
  border-radius: 8px;
  background: #d9e5c726;
  color: #d7e6b7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Georgia, serif;
  font-size: 19px;
}
.preview-investor {
  display: flex;
  flex-direction: column;
  font-size: 11px;
}
.preview-investor-title {
  color: #99b39e;
  font-size: 8px;
  margin-top: 1px;
}
.preview-arrow {
  margin-left: auto;
  color: #d9f18a;
  font-size: 24px;
}
.preview-orbit {
  position: absolute;
  width: 190px;
  height: 190px;
  border: 1px solid #b9d08810;
  border-radius: 50%;
  right: -50px;
  bottom: -70px;
  box-shadow:
    0 0 0 25px #b9d08807,
    0 0 0 50px #b9d08805;
}
.start-button {
  background: #d9f18a;
  color: #253629;
  margin-top: 17px;
  min-height: 55px;
}
.button-arrow {
  font-size: 23px;
  margin-left: auto;
}
.start-hint {
  display: block;
  margin: 10px 0 7px;
  text-align: center;
  font-size: 10px;
  color: #9aa18e;
}
.section-head .eyebrow {
  font-size: 8px;
  margin-bottom: 6px;
}
.section-title {
  font-size: 18px;
}
.section-side {
  font-size: 9px;
  color: #919a84;
  align-self: flex-end;
  padding-bottom: 3px;
}
.industry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.industry-card {
  border: 1px solid #e2e6d7;
  border-radius: 14px;
  padding: 14px;
  background: #fcfcf8;
  text-align: left;
}
.industry-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.industry-symbol {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eae6f0;
  color: #8c789d;
  border-radius: 8px;
  font-size: 19px;
}
.industry-symbol.blue {
  background: #e7eef4;
  color: #7690a4;
}
.industry-symbol.orange {
  background: #f5ebe0;
  color: #b89363;
}
.industry-symbol.teal {
  background: #e1eee6;
  color: #739984;
}
.industry-symbol.green {
  background: #edf0dc;
  color: #949d61;
}
.industry-arrow {
  color: #adb5a0;
  font-size: 16px;
}
.industry-name {
  display: block;
  font-weight: 650;
  font-size: 13px;
}
.industry-subtitle {
  display: block;
  font-size: 9px;
  color: #939b89;
  margin-top: 4px;
}
.committee-heading {
  gap: 4px;
}
.committee-heading .section-title {
  font-size: 17px;
}
.committee-heading .link {
  font-size: 10px;
  white-space: nowrap;
}
.committee-preview {
  display: flex;
  background: #eff1e7;
  border-radius: 16px;
  padding: 19px 10px;
}
.committee-person {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.person-name {
  font-size: 12px;
  font-weight: 700;
  margin-top: 1px;
}
.person-title {
  font-size: 9px;
  color: #8b9480;
}
.philosophy {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 28px 0 14px;
}
.philosophy-star {
  font-size: 27px;
  color: #9da986;
  line-height: 1.2;
}
.philosophy-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}
.philosophy .caption {
  font-size: 10px;
}
.about-link {
  text-align: center;
  font-size: 9px;
  color: #99a08c;
  padding: 10px 0;
}
@media (max-width: 350px) {
  .hero-title {
    font-size: 30px;
  }
  .preview-quote {
    font-size: 20px;
  }
  .section-title {
    font-size: 16px;
  }
}
</style>
