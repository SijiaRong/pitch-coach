<script setup lang="ts">
import { FUNDING_ROUNDS, INDUSTRIES, INVESTORS } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import InvestorAvatar from '@/components/InvestorAvatar.vue';
const industryFor = (id: string) => INDUSTRIES.find((industry) => industry.lead === id);
const roundFor = (id: string) => FUNDING_ROUNDS.find((round) => round.coach === id);
</script>

<template>
  <view class="page compact investors-page">
    <PageHeader back label="AI 投委会" />
    <text class="eyebrow">THREE MINDS. ONE REALITY CHECK.</text
    ><view class="investors-title">不是每位投资人，<br />都看同一份答案。</view
    ><text class="caption investors-description"
      >每场评估由一位行业主审、一位对应融资轮次的教练与财务理性派共同完成。8 个行业 × 6
      个轮次，独立判断，交叉追问。</text
    >
    <view class="notice"
      >所有角色均为虚构 AI
      投资人，不对应真实人物或机构。不同角色代表不同评审视角，可在后台分别配置模型。</view
    >
    <view
      v-for="investor in Object.values(INVESTORS)"
      :key="investor.id"
      class="investor-profile surface"
      ><view class="profile-top"
        ><InvestorAvatar :investor="investor" /><view
          ><view class="profile-name">{{ investor.name }}</view
          ><text class="profile-role">{{ investor.title }}</text></view
        ><view class="profile-kind">{{
          industryFor(investor.id) ? '行业主审' : roundFor(investor.id) ? '轮次教练' : '共同评审'
        }}</view></view
      ><view class="profile-quote">“{{ investor.opening }}”</view
      ><text class="profile-style">{{ investor.style }}</text
      ><view class="profile-focus"
        ><text class="focus-label">他会重点问</text><text>{{ investor.focus }}</text></view
      ><button
        v-if="industryFor(investor.id) || roundFor(investor.id)"
        class="profile-invite"
        @click="
          uni.reLaunch({
            url: `/pages/pitch/index?industry=${industryFor(investor.id)?.id || 'ai'}&round=${roundFor(investor.id)?.id || 'angel'}`,
          })
        "
      >
        让他看看我的项目 ↗
      </button></view
    >
    <button class="primary lime" @click="uni.reLaunch({ url: '/pages/pitch/index' })">
      组建我的 AI 投委会 ↗
    </button>
  </view>
</template>

<style scoped>
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
