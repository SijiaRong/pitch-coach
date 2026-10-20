<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  DEFAULT_PREFERENCES,
  FUNDING_ROUNDS,
  INDUSTRIES,
  INDUSTRY_IDS,
  PREFERENCES,
  ROUND_IDS,
  getIndustry,
  getPreference,
  getRound,
  getSpecialist,
  recommendPreferences,
} from '@pitchcoach/shared';
import type { IndustryId, PreferenceId, RoundId, SpecialistInvestor } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
import ReviewOfferStatus from '@/components/ReviewOfferStatus.vue';
import { useReviewOffer } from '@/lib/review-offer';
import { aboutPath } from '@/lib/share-entry';
const { state, offer, load } = useReviewOffer();
onShow(() => { void load(); });

const industry = ref<IndustryId>('ai');
const round = ref<RoundId>('angel');
const preference = ref<PreferenceId | ''>('');
const expandedId = ref('');
// One coach per screen: swipe or tap the dots to move through the roster.
const current = ref(0);
const currentInvestor = computed(() => roster.value[Math.min(current.value, roster.value.length - 1)]);
function onSwipe(event: { detail: { current: number } }) {
  current.value = event.detail.current;
  expandedId.value = '';
}
const currentRound = computed(() => getRound(round.value));
const roster = computed(() =>
  PREFERENCES.filter((item) => !preference.value || item.id === preference.value).map((item) =>
    getSpecialist(industry.value, round.value, item.id),
  ),
);
const matchedPreferences = computed(() =>
  preference.value ? recommendPreferences(preference.value) : [...DEFAULT_PREFERENCES],
);
const matchedPreferenceNames = computed(() =>
  matchedPreferences.value.map((item) => getPreference(item).name).join(' · '),
);
onLoad((options) => {
  if (options?.industry && INDUSTRY_IDS.includes(options.industry as IndustryId))
    industry.value = options.industry as IndustryId;
  if (options?.round && ROUND_IDS.includes(options.round as RoundId))
    round.value = options.round as RoundId;
});
watch(roster, () => {
  current.value = 0;
  expandedId.value = '';
});
function setIndustry(event: { detail: { value: string | number } }) {
  const selected = INDUSTRIES[Number(event.detail.value)];
  if (selected) industry.value = selected.id;
  expandedId.value = '';
}
function setRound(event: { detail: { value: string | number } }) {
  const selected = FUNDING_ROUNDS[Number(event.detail.value)];
  if (selected) round.value = selected.id;
  expandedId.value = '';
}
function invite(investor?: SpecialistInvestor) {
  const preferences = investor
    ? recommendPreferences(investor.preference)
    : [...matchedPreferences.value];
  const pages = getCurrentPages();
  if (pages.length > 1 && pages[pages.length - 2].route === 'pages/pitch/index') {
    uni.$emit('pitch:select-panel', { industry: industry.value, round: round.value, preferences });
    uni.navigateBack();
    return;
  }
  uni.reLaunch({
    url: `/pages/pitch/index?industry=${industry.value}&round=${round.value}&preferences=${preferences.join(',')}`,
  });
}
</script>

<template>
  <view class="page compact investors-page">
    <PageHeader back label="认识 AI 教练" />
    <view class="investors-heading"
      ><text class="eyebrow">换个视角，看清项目</text
      ><view class="investors-title">你关心的难题，<br />让专业视角来追问。</view
      ><text class="investors-description"
        >选好行业和轮次，左右滑动认识每位教练。</text
      ></view
    >
    <view class="directory-offer"><ReviewOfferStatus :state="state" :offer="offer" compact /><text>选用教练不额外加价；下一步填写自己的项目，不会立即扣费。</text><button @click="uni.navigateTo({ url: aboutPath('billing') })">交付与计次说明 →</button></view>
    <view class="coach-filters surface">
      <view class="filter-heading"
        ><text>匹配你的项目</text><text class="filter-step">01 / 行业与轮次</text></view
      >
      <view class="filter-pickers">
        <picker
          :range="INDUSTRIES.map((item) => item.name)"
          :value="INDUSTRIES.findIndex((item) => item.id === industry)"
          aria-label="选择行业领域"
          @change="setIndustry"
          ><view class="filter-picker"
            ><text class="focus-label">行业领域</text
            ><view class="picker-value"
              ><text>{{ getIndustry(industry).name }}</text
              ><text class="picker-arrow">⌄</text></view
            ></view
          ></picker
        >
        <picker
          :range="FUNDING_ROUNDS.map((item) => item.name)"
          :value="FUNDING_ROUNDS.findIndex((item) => item.id === round)"
          aria-label="选择融资轮次"
          @change="setRound"
          ><view class="filter-picker"
            ><text class="focus-label">融资轮次</text
            ><view class="picker-value"
              ><text>{{ currentRound.name }}</text
              ><text class="picker-arrow">⌄</text></view
            ></view
          ></picker
        >
      </view>
      <view class="round-focus"
        ><text class="focus-label">{{ currentRound.name }}的关键问题</text
        ><text>{{ currentRound.question }}</text></view
      >
      <view class="preference-heading"
        ><text class="focus-label">02 / 浏览评审偏好</text
        ><button
          class="filter-reset"
          :class="{ selected: !preference }"
          :aria-pressed="!preference"
          @click="preference = ''"
        >
          查看全部 {{ PREFERENCES.length }} 位
        </button></view
      >
      <view class="preference-filters"
        ><button
          v-for="item in PREFERENCES"
          :key="item.id"
          :class="{ selected: preference === item.id }"
          :aria-pressed="preference === item.id"
          @click="preference = preference === item.id ? '' : item.id"
        >
          <text v-if="preference === item.id" class="filter-check">✓</text>{{ item.name }}
        </button></view
      >
    </view>
    <view class="roster-heading"
      ><view
        ><text class="roster-title">{{ getIndustry(industry).name }} · {{ currentRound.name }}</text
        ><text class="roster-caption">{{
          preference ? `${getPreference(preference).name}视角` : '按评审偏好认识教练'
        }}</text></view
      ><text class="roster-count">{{ roster.length }} 位教练</text></view
    >
    <swiper
      class="roster-swiper"
      :current="current"
      previous-margin="0px"
      next-margin="36px"
      :duration="320"
      @change="onSwipe"
    >
      <swiper-item v-for="(investor, index) in roster" :key="investor.id">
        <view class="investor-profile surface" :class="{ dimmed: index !== current }">
          <view class="profile-top"
            ><InvestorAvatar :investor="investor" /><view class="profile-identity"
              ><view class="profile-name">{{ investor.name }}</view
              ><text class="profile-role">AI 教练</text></view
            ><view class="profile-kind">{{ getPreference(investor.preference).name }}</view></view
          >
          <view class="profile-quote">“{{ investor.opening }}”</view>
          <text class="profile-style clamp">{{ investor.style }}</text>
          <button
            class="profile-invite"
            :aria-label="`选用${investor.name}的评审视角，下一步填写项目`"
            @click="invite(investor)"
          >
            <text>选这个视角，去填项目</text><text>→</text>
          </button>
        </view>
      </swiper-item>
    </swiper>
    <view class="roster-dots" role="tablist">
      <button
        v-for="(investor, index) in roster"
        :key="investor.id"
        class="roster-dot"
        :class="{ on: index === current }"
        :aria-label="`第 ${index + 1} 位：${investor.name}`"
        @click="current = index"
      />
    </view>
    <view v-if="currentInvestor" class="current-details">
      <button
        class="profile-details-toggle"
        :aria-expanded="expandedId === currentInvestor.id"
        @click="expandedId = expandedId === currentInvestor.id ? '' : currentInvestor.id"
      >
        <text>{{ currentInvestor.name }} 会追问什么</text
        ><text>{{ expandedId === currentInvestor.id ? '−' : '+' }}</text>
      </button>
      <view v-if="expandedId === currentInvestor.id" class="profile-focus"
        ><text class="focus-label">会核验哪些证据</text><text>{{ currentInvestor.focus }}</text
        ><text class="focus-label question-label">先试着回答</text
        ><view class="profile-question"
          ><text class="question-number">01</text><text>{{ currentInvestor.question }}</text></view
        ><view class="profile-question"
          ><text class="question-number">02</text><text>{{ currentInvestor.roundQuestion }}</text></view
        ></view
      >
    </view>
    <view class="notice"
      >所有教练均为 AI 角色（姓名为设定，非真人），不代表任何机构。评审仅供参考，不构成投资建议。</view
    >
    <view class="directory-footer"
      ><view class="footer-match"
        ><text class="footer-label">当前推荐的三种视角</text
        ><text class="footer-preferences">{{ matchedPreferenceNames }}</text></view
      ><button class="primary lime" @click="invite()">
        <view class="footer-cta-copy"><text>选用这组教练 ↗</text><text>下一步填写项目</text></view>
      </button></view
    >
  </view>
</template>

<style scoped>
.page.investors-page {
  padding-bottom: calc(220px + env(safe-area-inset-bottom));
}
.investors-heading {
  margin-bottom: 23px;
}
.investors-heading .eyebrow {
  color: #5d7751;
  font-size: 12px;
  letter-spacing: 1px;
}
.investors-title {
  font-size: 27px;
  font-weight: 800;
  line-height: 1.45;
  letter-spacing: -1px;
  margin: 11px 0 13px;
}
.investors-description {
  display: block;
  color: #63735c;
  font-size: 13px;
  line-height: 1.9;
}
.coach-filters {
  padding: 18px;
  margin-bottom: 24px;
}
.filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 14px;
}
.filter-step {
  color: #718364;
  font-size: 12px;
  font-weight: 400;
}
.filter-pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.filter-picker {
  min-height: 68px;
  font-size: 14px;
  padding: 11px 12px;
  background: #f0f3e9;
  border: 1px solid #e0e6d7;
  border-radius: 10px;
}
.focus-label {
  display: block;
  font-size: 12px;
  color: #607653;
  margin-bottom: 6px;
  line-height: 1.6;
}
.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: #314d37;
  font-size: 13px;
  font-weight: 650;
}
.picker-arrow {
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
}
.round-focus {
  margin-top: 12px;
  padding: 11px 0 15px;
  font-size: 12px;
  line-height: 1.8;
  color: #47643d;
  border-bottom: 1px solid #e8ecdf;
}
.round-focus .focus-label {
  color: #718268;
  font-size: 12px;
}
.preference-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}
.preference-heading .focus-label {
  margin: 0;
  font-size: 12px;
}
.investors-page .filter-reset {
  min-height: 44px;
  color: #546f44;
  font-size: 12px;
  display: flex;
  align-items: center;
}
.investors-page .filter-reset.selected {
  font-weight: 700;
}
.preference-filters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.investors-page .preference-filters button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 3px;
  min-height: 44px;
  font-size: 12px;
  border: 1px solid #dce3d1;
  border-radius: 9px;
  color: #607651;
  background: #fff;
}
.investors-page .preference-filters button.selected {
  background: #e9f1d9;
  border-color: #7f9b59;
  color: #385b2e;
  font-weight: 700;
}
.filter-check {
  font-size: 12px;
}
.roster-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
}
.roster-title {
  display: block;
  color: #314b34;
  font-size: 14px;
  font-weight: 700;
}
.roster-caption {
  display: block;
  margin-top: 4px;
  color: #697c5d;
  font-size: 12px;
}
.roster-count {
  font-size: 12px;
  color: #65795a;
  white-space: nowrap;
}
.investor-profile {
  margin-bottom: 14px;
  padding: 18px;
}
.profile-top {
  display: flex;
  align-items: center;
  gap: 11px;
}
.profile-identity {
  flex: 1;
  min-width: 0;
}
.profile-name {
  font-weight: 700;
  font-size: 17px;
}
.profile-role {
  font-size: 12px;
  color: #718167;
}
.profile-kind {
  flex-shrink: 0;
  font-size: 12px;
  color: #4d6d3b;
  background: #edf3e4;
  padding: 5px 8px;
  border-radius: 7px;
}
.profile-quote {
  font-size: 17px;
  line-height: 1.75;
  font-weight: 700;
  margin: 17px 0 10px;
  color: #2b4632;
}
.profile-style {
  display: block;
  font-size: 12px;
  color: #64765b;
  line-height: 1.85;
}
.investors-page .profile-details-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 46px;
  width: 100%;
  text-align: left;
  margin-top: 10px;
  color: #4d713f;
  font-size: 12px;
}
.profile-details-toggle > text:last-child {
  font-size: 20px;
  font-weight: 400;
}
.profile-focus {
  padding: 14px 0 6px;
  border-top: 1px solid #e5eadc;
  font-size: 12px;
  color: #617455;
  line-height: 1.9;
}
.profile-focus > .focus-label {
  font-weight: 700;
  color: #416235;
  font-size: 12px;
}
.question-label {
  margin-top: 14px;
}
.profile-question {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 9px;
}
.question-number {
  flex-shrink: 0;
  color: #6f855c;
  font-size: 10px;
  font-weight: 700;
  padding-top: 3px;
}
.investors-page .profile-invite {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 46px;
  padding: 10px 13px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  background: #edf3e3;
  color: #39612e;
  font-size: 12px;
  text-align: left;
  font-weight: 650;
}
.profile-invite > text:last-child {
  font-size: 18px;
  font-weight: 400;
}
.invite-note {
  display: block;
  text-align: center;
  color: #728265;
  font-size: 12px;
  line-height: 1.7;
  margin-top: 8px;
}
.investors-page > .notice {
  margin-top: 20px;
  font-size: 12px;
}
.directory-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 12px 24px calc(14px + env(safe-area-inset-bottom));
  z-index: 25;
  background: #fafbf5;
  border-top: 1px solid #dce3d1;
  box-shadow: 0 -8px 22px #26332706;
}
.footer-match {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 9px;
}
.footer-label {
  font-size: 12px;
  color: #6b805c;
}
.footer-preferences {
  font-size: 12px;
  color: #3f5e33;
  line-height: 1.65;
}
.directory-footer .primary {
  justify-content: space-between;
}
@media (max-width: 350px) {
  .investors-title {
    font-size: 26px;
  }
  .coach-filters,
  .investor-profile {
    padding: 15px;
  }
  .filter-heading {
    font-size: 13px;
  }
  .filter-step {
    font-size: 12px;
  }
  .filter-picker {
    padding: 10px;
  }
  .preference-filters {
    gap: 6px;
  }
  .investors-page .preference-filters button {
    font-size: 12px;
  }
  .profile-kind {
    font-size: 12px;
    padding: 4px 6px;
  }
}
.directory-offer { margin: 0 0 20px; padding: 16px; border: 1px solid #dfe5d7; background: #edf2e3; border-radius: 16px; }
.directory-offer > text { display: block; font-size: 12px; line-height: 1.75; color: #626d64; margin-top: 10px; }
.investors-page .directory-offer button { min-height: 44px; width: 100%; text-align: left; color: #2f684e; font-size: 12px; padding-top: 8px; }
.footer-cta-copy text { display: block; }
.footer-cta-copy text:last-child { font-size: 12px; font-weight: 400; margin-top: 2px; }
.roster-swiper { height: 330px; margin: 0 -24px 0 0; }
.roster-swiper swiper-item, .roster-swiper uni-swiper-item { padding-right: 12px; box-sizing: border-box; }
.investors-page .roster-swiper .investor-profile { height: 318px; margin: 0; display: flex; flex-direction: column; transition: transform .3s ease, opacity .3s ease; }
.investors-page .roster-swiper .investor-profile.dimmed { transform: scale(.95); opacity: .55; }
.investors-page .roster-swiper .profile-invite { margin-top: auto; }
.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.roster-dots { display: flex; justify-content: center; gap: 2px; margin: 8px 0 4px; }
.roster-dot { width: 22px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative; }
.roster-dot::before { content: ''; width: 6px; height: 6px; border-radius: 3px; background: #c9d3bd; transition: width .3s ease, background .3s ease; }
.roster-dot.on::before { width: 18px; background: #2f684e; }
.current-details { margin: 4px 0 18px; padding: 0 2px; }
.current-details .profile-focus { animation: details-in .3s ease both; }
@keyframes details-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .investors-page .roster-swiper .investor-profile, .roster-dot::before { transition: none; } .current-details .profile-focus { animation: none; } }
</style>
