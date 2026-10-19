<script setup lang="ts">
import { computed, ref } from 'vue';
import { INVESTORS, RISK_TOPIC_LABELS } from '@pitchcoach/shared';
import type { ReportDiagnostics } from '@pitchcoach/shared';

const props = defineProps<{ diagnostics?: ReportDiagnostics }>();
const selected = ref('');
const active = computed(
  () => selected.value || (props.diagnostics?.redFlags.length ? 'red' : 'orange'),
);
const authors = (ids: string[]) => ids.map((id) => INVESTORS[id]?.name || 'AI 评审').join('、');
const sections = computed(() => [
  { id: 'red', label: '阻断红旗', count: props.diagnostics?.redFlags.length ?? 0 },
  { id: 'orange', label: '待答橙旗', count: props.diagnostics?.orangeFlags.length ?? 0 },
  { id: 'death', label: '死亡预言', count: props.diagnostics?.failureModes.length ?? 0 },
  { id: 'assumption', label: '关键假设', count: props.diagnostics?.assumptions.length ?? 0 },
]);
</script>

<template>
  <view v-if="!diagnostics" class="legacy-diagnosis">
    这份旧报告尚未检查红橙旗、失败路径与关键假设。请重新评估，不能将未检查视为零风险。
  </view>
  <view v-else class="risk-diagnosis">
    <view class="risk-sections">
      <button
        v-for="section in sections"
        :key="section.id"
        class="risk-section-button"
        :class="[section.id, { active: active === section.id }]"
        @click="selected = section.id"
      >
        <text class="risk-count mono">{{ section.count }}</text
        ><text>{{ section.label }}</text>
      </button>
    </view>
    <template v-if="active === 'red'">
      <text class="risk-intro">解除前暂停推进。红旗不能被参考总分抵消；资料陈述仍需独立核实。</text>
      <view v-if="!diagnostics.redFlags.length" class="risk-empty"
        >本次未识别到有原文依据的阻断红旗，不代表已通过尽调。</view
      >
      <view v-for="(flag, index) in diagnostics.redFlags" :key="index" class="risk-card red-card">
        <view class="risk-title"><text class="risk-tag red-tag">红旗</text>{{ flag.title }}</view>
        <text class="risk-body">{{ flag.detail }}</text>
        <text class="risk-label">依据 · 资料原文，未经独立核实</text
        ><text class="risk-evidence">“{{ flag.evidence }}”</text>
        <text class="risk-label">核验追问</text><text class="risk-body">{{ flag.question }}</text>
        <text class="risk-label">解除条件</text><text class="risk-body">{{ flag.remedy }}</text>
        <text class="risk-authors">提出评审：{{ authors(flag.investorIds) }}</text>
      </view>
    </template>
    <template v-if="active === 'orange'">
      <text class="risk-intro"
        >投资人会追问，但当前资料没有回答清楚。缺少证据不等于事实为负面。</text
      >
      <view v-if="!diagnostics.orangeFlags.length" class="risk-empty"
        >本次未列出关键待答问题，不代表资料已经完备。</view
      >
      <view
        v-for="(flag, index) in diagnostics.orangeFlags"
        :key="index"
        class="risk-card orange-card"
      >
        <view class="risk-title"
          ><text class="risk-tag orange-tag">橙旗</text>{{ flag.title }}</view
        >
        <text class="risk-body">{{ flag.detail }}</text>
        <template v-if="flag.evidence"
          ><text class="risk-label">相关原文 · 未经独立核实</text
          ><text class="risk-evidence">“{{ flag.evidence }}”</text></template
        >
        <text class="risk-label">还缺什么</text><text class="risk-body">{{ flag.missing }}</text>
        <text class="risk-label">投资人会问</text
        ><text class="risk-body">{{ flag.question }}</text> <text class="risk-label">怎样补证</text
        ><text class="risk-body">{{ flag.remedy }}</text>
        <text class="risk-authors">提出评审：{{ authors(flag.investorIds) }}</text>
      </view>
    </template>
    <template v-if="active === 'death'">
      <text class="risk-intro"
        >预演一种可能失败的机制。它有触发条件，可以被验证或避免，不是命运宣判。</text
      >
      <view v-if="!diagnostics.failureModes.length" class="risk-empty"
        >资料尚不足以形成可追溯的失败路径。</view
      >
      <view
        v-for="(failure, index) in diagnostics.failureModes"
        :key="index"
        class="risk-card death-card"
      >
        <view class="risk-title">{{ failure.condition }}</view
        ><text class="risk-body failure-chain">{{ failure.chain }}</text>
        <text class="risk-label">关联风险</text
        ><text class="risk-body">{{
          failure.basedOn.map((topic) => RISK_TOPIC_LABELS[topic]).join(' / ')
        }}</text>
        <text class="risk-label">早期预警</text
        ><text class="risk-body">{{ failure.earlySignal }}</text>
        <text class="risk-label">怎样避免 / 推翻</text
        ><text class="risk-body">{{ failure.prevention }}</text>
        <text class="risk-authors">提出评审：{{ authors(failure.investorIds) }}</text>
      </view>
    </template>
    <template v-if="active === 'assumption'">
      <text class="risk-intro"
        >这是商业故事成立的前提，尚未验证。先约定通过标准，再用实验检验。</text
      >
      <view v-if="!diagnostics.assumptions.length" class="risk-empty"
        >本次未识别关键未验假设，不代表全部假设已验证。</view
      >
      <view
        v-for="(item, index) in diagnostics.assumptions"
        :key="index"
        class="risk-card assumption-card"
      >
        <view class="risk-title">{{ item.statement }}</view
        ><text class="assumption-basis">{{
          item.basis === 'stated' ? '材料中提出 · 未验证' : '评审推演 · 待验证'
        }}</text>
        <template v-if="item.evidence"
          ><text class="risk-label">相关原文 · 未经独立核实</text
          ><text class="risk-evidence">“{{ item.evidence }}”</text></template
        >
        <text class="risk-label">为什么关键</text
        ><text class="risk-body">{{ item.whyCritical }}</text>
        <text class="risk-label">最小验证实验</text><text class="risk-body">{{ item.test }}</text>
        <text class="risk-label">通过标准</text
        ><text class="risk-body">{{ item.passCriterion }}</text>
        <text class="risk-authors">提出评审：{{ authors(item.investorIds) }}</text>
      </view>
    </template>
  </view>
</template>

<style scoped>
.risk-sections {
  display: flex;
  gap: 7px;
  margin-bottom: 16px;
}
.risk-section-button {
  flex: 1;
  padding: 11px 2px;
  border: 1px solid #e0e5d5;
  border-radius: 10px;
  color: #88957d;
  font-size: 10px;
}
.risk-count {
  display: block;
  font-size: 21px;
  margin-bottom: 3px;
}
.risk-sections .active {
  border-color: #718763;
  background: #e9eedf;
  color: #3e5c43;
}
.risk-sections .red.active {
  border-color: #bd5d50;
  background: #f8e9e2;
  color: #9c4237;
}
.risk-sections .orange.active {
  border-color: #c89944;
  background: #f8efd9;
  color: #93671f;
}
.risk-intro,
.risk-empty,
.legacy-diagnosis {
  display: block;
  font-size: 11px;
  line-height: 1.9;
  color: #79886f;
}
.risk-empty,
.legacy-diagnosis {
  padding: 18px;
  border: 1px dashed #d3dbc5;
  border-radius: 10px;
}
.risk-empty {
  margin-top: 14px;
}
.risk-card {
  margin-top: 15px;
  padding: 17px;
  background: #f0f2e7;
  border-radius: 12px;
  border-left: 3px solid #8e9b78;
}
.red-card {
  background: #f8eee8;
  border-left-color: #bb5d4f;
}
.orange-card {
  background: #f8f1e2;
  border-left-color: #bf9243;
}
.death-card {
  background: #e9ede5;
  border-left-color: #4c6656;
}
.risk-title {
  font-size: 14px;
  color: #354d3e;
  line-height: 1.7;
  font-weight: 700;
  margin-bottom: 9px;
}
.risk-tag {
  font-size: 9px;
  padding: 3px 5px;
  border-radius: 4px;
  margin-right: 7px;
  vertical-align: 1px;
}
.red-tag {
  background: #ecd6cc;
  color: #9a4438;
}
.orange-tag {
  background: #eddfbb;
  color: #8c641f;
}
.risk-body,
.risk-evidence {
  display: block;
  font-size: 11px;
  color: #65755c;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.risk-label {
  display: block;
  font-size: 10px;
  color: #859278;
  margin: 14px 0 5px;
  font-weight: 600;
}
.risk-evidence {
  padding: 9px 11px;
  background: #ffffff70;
  border-radius: 6px;
}
.risk-authors,
.assumption-basis {
  display: block;
  font-size: 9px;
  color: #91a083;
  line-height: 1.7;
  margin-top: 13px;
}
.assumption-basis {
  margin-top: -4px;
}
.failure-chain {
  color: #3e5c48;
  font-weight: 600;
}
</style>
