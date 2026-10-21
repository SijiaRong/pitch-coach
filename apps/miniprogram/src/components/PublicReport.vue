<script setup lang="ts">
import { ref } from 'vue';
import { INVESTORS, VOTE_LABELS } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import RiskDiagnosis from './RiskDiagnosis.vue';
defineProps<{ report: EvaluationReport }>();
const tab = ref('risks');
</script>
<template>
  <view class="public-report-content">
    <view class="memo-tabs"
      ><button
        v-for="item in [
          { id: 'risks', label: '风险诊断' },
          { id: 'dimensions', label: '八维评估' },
          { id: 'investors', label: '投委会意见' },
          { id: 'actions', label: '改进清单' },
        ]"
        :key="item.id"
        class="memo-tab"
        :class="{ active: tab === item.id }"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button></view
    >
    <RiskDiagnosis v-if="tab === 'risks'" :diagnostics="report.diagnostics" />
    <template v-if="tab === 'dimensions'">
      <view v-for="dimension in report.dimensions" :key="dimension.id" class="memo-card">
        <view class="memo-heading"
          >{{ dimension.name }}
          <text>{{ dimension.score ?? '待补' }} / 100 · 权重 {{ dimension.weight }}%</text></view
        >
        <text class="memo-body">{{ dimension.reason }}</text
        ><text v-if="dimension.evidence" class="memo-quote"
          >原文依据（未经独立核实）：{{ dimension.evidence }}</text
        ><text class="memo-body">建议：{{ dimension.action }}</text>
      </view>
    </template>
    <template v-if="tab === 'investors'">
      <view v-for="review in report.investors" :key="review.investorId" class="memo-card">
        <view class="memo-heading"
          >{{ INVESTORS[review.investorId]?.name || 'AI 评审' }}
          <text>{{ review.score ?? '待补' }} · {{ VOTE_LABELS[review.vote] }}</text></view
        >
        <text class="memo-label">{{ INVESTORS[review.investorId]?.title }} · AI 投资人</text>
        <text class="memo-body">“{{ review.oneLiner }}”</text
        ><text class="memo-body">{{ review.thesis }}</text>
        <text v-for="question in review.questions" :key="question" class="memo-quote"
          >追问：{{ question }}</text
        >
        <text v-for="risk in review.risks" :key="risk" class="memo-body">风险：{{ risk }}</text>
        <text class="memo-label">模型：{{ review.model }} · 证据覆盖 {{ review.coverage }}%</text>
      </view>
    </template>
    <template v-if="tab === 'actions'"
      ><view v-for="action in report.actions" :key="action.priority" class="memo-card"
        ><view class="memo-heading">{{ action.priority }}. {{ action.dimension }}</view
        ><text class="memo-body">{{ action.task }}</text></view
      ></template
    >
    <text class="memo-disclaimer">{{ report.disclaimer }}</text>
  </view>
</template>
<style scoped>
.memo-tabs {
  display: flex;
  gap: 8px;
  margin: 24px 0 18px;
  border-bottom: 1px solid #dce3d1;
}
.memo-tab {
  flex: 1;
  padding: 12px 0;
  font-size: 11px;
  color: #8c9a7e;
}
.memo-tab.active {
  color: #355c42;
  border-bottom: 2px solid #6e8952;
}
.memo-card {
  padding: 17px;
  background: #eff2e6;
  border-radius: 12px;
  margin: 13px 0;
}
.memo-heading {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.8;
  color: #334d3e;
}
.memo-heading text {
  font-size: 10px;
  font-weight: 400;
  color: #849875;
  margin-left: 8px;
}
.memo-body,
.memo-quote {
  display: block;
  font-size: 12px;
  line-height: 1.9;
  color: #63765b;
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.memo-quote {
  background: #ffffff70;
  padding: 10px;
  border-radius: 7px;
}
.memo-label,
.memo-disclaimer {
  display: block;
  font-size: 10px;
  line-height: 1.9;
  color: #8d9a80;
  margin-top: 12px;
}
.memo-disclaimer {
  padding: 16px 0;
}
</style>
