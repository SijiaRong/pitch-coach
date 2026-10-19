<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  FUNDING_ROUNDS,
  INDUSTRIES,
  INDUSTRY_IDS,
  INVESTOR_ROSTER,
  PREFERENCES,
  ROUND_IDS,
  getIndustry,
  getRound,
  getSpecialist,
  recommendPreferences,
} from '@pitchcoach/shared';
import type { IndustryId, PreferenceId, RoundId, SpecialistInvestor } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
const industry = ref<IndustryId>('ai');
const round = ref<RoundId>('angel');
const preference = ref<PreferenceId | ''>('');
const roster = computed(() =>
  PREFERENCES.filter((item) => !preference.value || item.id === preference.value).map((item) =>
    getSpecialist(industry.value, round.value, item.id),
  ),
);
onLoad((options) => {
  if (options?.industry && INDUSTRY_IDS.includes(options.industry as IndustryId))
    industry.value = options.industry as IndustryId;
  if (options?.round && ROUND_IDS.includes(options.round as RoundId))
    round.value = options.round as RoundId;
});
function setIndustry(event: { detail: { value: string | number } }) {
  industry.value = INDUSTRIES[Number(event.detail.value)].id;
}
function setRound(event: { detail: { value: string | number } }) {
  round.value = FUNDING_ROUNDS[Number(event.detail.value)].id;
}
function invite(investor?: SpecialistInvestor) {
  const preferences = investor
    ? `&preferences=${recommendPreferences(investor.preference).join(',')}`
    : '';
  uni.reLaunch({
    url: `/pages/pitch/index?industry=${industry.value}&round=${round.value}${preferences}`,
  });
}
</script>

<template>
  <view class="page compact investors-page">
    <PageHeader back label="AI 投委会" />
    <text class="eyebrow">FIND YOUR INVESTMENT COMMITTEE</text
    ><view class="investors-title">不是每位投资人，<br />都看同一份答案。</view
    ><text class="caption investors-description"
      >{{ FUNDING_ROUNDS.length }} 个轮次 × {{ INDUSTRIES.length }} 个领域 ×
      {{ PREFERENCES.length }} 种偏好， 共
      {{ INVESTOR_ROSTER.length }} 位专项教练。每一格都有自己的追问，每场邀请三位交叉审阅。</text
    >
    <view class="notice"
      >所有角色均为虚构 AI
      投资人，不对应真实人物或机构。不同角色代表不同评审视角，可在后台分别配置模型。</view
    >
    <view class="coach-filters surface">
      <view class="filter-pickers">
        <picker
          :range="INDUSTRIES.map((item) => item.name)"
          :value="INDUSTRIES.findIndex((item) => item.id === industry)"
          @change="setIndustry"
        >
          <view class="filter-picker"
            ><text class="focus-label">行业领域</text
            ><text>{{ getIndustry(industry).name }} ⌄</text></view
          >
        </picker>
        <picker
          :range="FUNDING_ROUNDS.map((item) => item.name)"
          :value="FUNDING_ROUNDS.findIndex((item) => item.id === round)"
          @change="setRound"
        >
          <view class="filter-picker"
            ><text class="focus-label">融资轮次</text
            ><text>{{ getRound(round).name }} ⌄</text></view
          >
        </picker>
      </view>
      <text class="focus-label">投资偏好</text>
      <view class="preference-filters">
        <button
          :class="{ selected: !preference }"
          :aria-pressed="!preference"
          @click="preference = ''"
        >
          全部偏好
        </button>
        <button
          v-for="item in PREFERENCES"
          :key="item.id"
          :class="{ selected: preference === item.id }"
          :aria-pressed="preference === item.id"
          @click="preference = item.id"
        >
          {{ item.name }}
        </button>
      </view>
    </view>
    <view class="roster-label"
      >{{ getIndustry(industry).name }} · {{ getRound(round).name }} /
      {{ roster.length }} 位教练</view
    >
    <view v-for="investor in roster" :key="investor.id" class="investor-profile surface"
      ><view class="profile-top"
        ><InvestorAvatar :investor="investor" /><view
          ><view class="profile-name">{{ investor.name }}</view
          ><text class="profile-role">{{ investor.title }}</text></view
        ><view class="profile-kind">{{ getRound(investor.round).name }}</view></view
      ><view class="profile-quote">“{{ investor.opening }}”</view
      ><text class="profile-style">{{ investor.style }}</text
      ><view class="profile-focus"
        ><text class="focus-label">专项证据</text><text>{{ investor.focus }}</text>
        <text class="focus-label question-label">先过这两问</text
        ><text>{{ investor.question }}</text
        ><text class="round-question">{{ investor.roundQuestion }}</text></view
      ><button class="profile-invite" @click="invite(investor)">
        邀请这位教练与另外两位共同审阅 ↗
      </button></view
    >
    <button class="primary lime" @click="invite()">组建我的 AI 投委会 ↗</button>
  </view>
</template>

<style scoped>
.coach-filters {
  margin-bottom: 16px;
}
.filter-pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.filter-picker {
  font-size: 12px;
  padding: 10px;
  background: #f0f3e9;
  border-radius: 10px;
}
.preference-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.preference-filters button {
  padding: 7px 9px;
  font-size: 10px;
  border: 1px solid #e0e4d6;
  border-radius: 8px;
}
.preference-filters button.selected {
  background: #e8efd9;
  border-color: #a5b977;
  color: #456339;
}
.roster-label {
  font-size: 11px;
  color: #7b8c6e;
  margin: 18px 0 12px;
}
.question-label {
  margin-top: 12px;
}
.round-question {
  display: block;
  margin-top: 6px;
}
.investors-page > .eyebrow {
  font-size: 8px;
}
.investors-title {
  font-size: 29px;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: -1px;
  margin: 12px 0;
}
.investors-description {
  margin-bottom: 20px;
}
.investors-page > .notice {
  font-size: 10px;
  margin-bottom: 22px;
}
.investor-profile {
  margin-bottom: 13px;
}
.profile-top {
  display: flex;
  align-items: center;
  gap: 11px;
}
.profile-name {
  font-weight: 700;
  font-size: 17px;
}
.profile-role {
  font-size: 10px;
  color: #93a283;
}
.profile-kind {
  margin-left: auto;
  font-size: 8px;
  color: #a3ae96;
  background: #f0f3e9;
  padding: 3px 7px;
  border-radius: 6px;
}
.profile-quote {
  font-size: 17px;
  line-height: 1.8;
  font-weight: 700;
  margin: 18px 0 10px;
}
.profile-style {
  font-size: 11px;
  color: #8d9d7c;
  line-height: 1.9;
}
.profile-focus {
  padding-top: 13px;
  margin-top: 15px;
  border-top: 1px solid #edf0e5;
  font-size: 10px;
  color: #99a68b;
  line-height: 1.9;
}
.focus-label {
  display: block;
  font-size: 9px;
  color: #708b57;
  margin-bottom: 5px;
}
.profile-invite {
  color: #7a955e;
  text-align: left;
  font-size: 10px;
  margin-top: 13px;
  padding-top: 10px;
  border-top: 1px solid #edf0e5;
}
.investors-page > .primary {
  margin-top: 25px;
}
</style>
