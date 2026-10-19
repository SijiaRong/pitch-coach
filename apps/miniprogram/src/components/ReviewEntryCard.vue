<script setup lang="ts">
import type { EvaluationReport } from '@pitchcoach/shared';
import type { OfferState, ReviewOffer } from '@/lib/review-offer';
import { reassessmentDescription } from '@/lib/review-offer';
import ReviewOfferStatus from './ReviewOfferStatus.vue';
import { openReviewEntry } from '@/lib/review-entry';
defineProps<{ report: EvaluationReport; state: OfferState; offer?: ReviewOffer }>();
</script>
<template>
  <view class="entry-card">
    <view class="entry-title">{{ report.mode === 'demo' ? '看看你的项目，会被追问什么？' : '先补证据，再检验一次。' }}</view>
    <text class="entry-copy">{{ report.mode === 'demo' ? '填写自己的资料，获取实际 AI 反馈。' : reassessmentDescription(state, offer) }}</text>
    <ReviewOfferStatus :state="state" :offer="offer" compact />
    <button class="primary lime" @click="openReviewEntry({ report, industry: report.industry, round: report.round })">{{ report.mode === 'demo' ? '评审我的项目' : '补充证据，再评一轮' }} ↗</button>
    <text class="entry-hint">{{ report.mode === 'demo' ? '下一步先填写，不会立即扣费' : '只带入名称与设置；介绍、BP 和授权需要重新填写' }}</text>
  </view>
</template>
<style scoped>
.entry-card { background: #edf2e3; border: 1px solid #dbe5cf; border-radius: 16px; padding: 16px; margin: 16px 0 24px; }
.entry-title { font-size: 18px; font-weight: 750; line-height: 1.5; }
.entry-copy { display: block; font-size: 13px; color: #626d64; line-height: 1.85; margin: 8px 0 12px; }
.entry-card .primary { margin-top: 14px; }
.entry-hint { display: block; margin-top: 8px; text-align: center; color: #626d64; font-size: 12px; line-height: 1.75; }
</style>
