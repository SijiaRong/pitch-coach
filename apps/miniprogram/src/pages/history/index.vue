<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  decisionLabel,
  publicDiagnosticSummary,
  createDemoReport,
  getIndustry,
  getRound,
} from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import { clearHistory, openReport, readHistory, removeReport } from '@/lib/storage';

const reports = ref<EvaluationReport[]>([]);
onShow(() => {
  reports.value = readHistory();
});
const dateLabel = (value: string) => {
  const date = new Date(value);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
function clear() {
  uni.showModal({
    title: '清空本机报告',
    content: '将删除这台设备上的全部历史报告，删除后无法恢复。',
    confirmText: '清空',
    confirmColor: '#6d8150',
    success: (result) => {
      if (result.confirm) {
        clearHistory();
        reports.value = [];
      }
    },
  });
}
function remove(id: string) {
  uni.showModal({
    title: '删除这份报告',
    content: '报告仅存在本机，删除后无法恢复。',
    confirmText: '删除',
    confirmColor: '#6d8150',
    success: (result) => {
      if (result.confirm) {
        removeReport(id);
        reports.value = readHistory();
      }
    },
  });
}
</script>

<template>
  <view class="page history-page">
    <PageHeader />
    <view class="history-heading"
      ><text class="eyebrow">LESS PITCH. MORE PROOF.</text
      ><view class="history-title">每一次追问，<br />都是一次进步。</view
      ><text class="caption">保留你的评估，看看证据有没有变得更扎实。</text></view
    >
    <view v-if="reports.length" class="history-summary"
      ><text>{{ reports.length }} 份本机报告</text><button @click="clear">清空记录</button></view
    >
    <view v-if="!reports.length" class="empty-state"
      ><view class="empty-illustration"
        ><view class="empty-paper"><view /><view /><view /></view><text>↗</text></view
      ><view class="empty-title">第一份报告，等你开场。</view
      ><view class="empty-description"
        >一个想法，一段介绍。<br />让 AI 投委会帮你把问题想得再透一点。</view
      ><button class="primary lime" @click="uni.reLaunch({ url: '/pages/pitch/index' })">
        评估我的项目 ↗</button
      ><button class="example-link" @click="openReport(createDemoReport())">
        先看示例报告 →
      </button></view
    >
    <view v-for="report in reports" :key="report.id" class="history-card surface"
      ><button
        class="history-open"
        @click="uni.navigateTo({ url: `/pages/report/index?id=${encodeURIComponent(report.id)}` })"
      >
        <view class="history-card-top"
          ><view class="tag-list"
            ><view class="pill"
              >{{ getIndustry(report.industry).name }} ·
              {{ getRound(report.round || 'angel').name }}</view
            ><view v-if="report.mode === 'demo'" class="pill demo">演示</view></view
          ><text class="history-date">{{ dateLabel(report.createdAt) }}</text></view
        ><view class="history-card-main"
          ><view
            ><text class="history-project-name">{{ report.projectName }}</text
            ><text class="history-verdict"
              >{{ decisionLabel(report) }} · 证据覆盖 {{ report.coverage }}%</text
            ></view
          ><view class="history-score mono">{{ report.score ?? '—' }}<text>/100</text></view></view
        ><view class="history-quote">“{{ report.headline }}”</view>
        <text class="history-diagnostics">{{
          publicDiagnosticSummary(report).counts
        }}</text></button
      ><view class="history-card-bottom"
        ><text>查看完整评估 ↗</text><button @click="remove(report.id)">删除</button></view
      ></view
    >
    <view class="notice local-note"
      >本机最多保留最近 20
      份报告，清理缓存或卸载后可能丢失。单独确认公开的项目及购买记录在后台保留；删除本机报告不会停止公开分享，请到下方管理。</view
    >
    <button
      class="history-privacy"
      @click="uni.navigateTo({ url: '/pages/privacy/index?section=rights' })"
    >
      隐私管理与使用说明 ↗
    </button>
    <button class="history-commerce" @click="uni.navigateTo({ url: '/pages/commerce/index' })">
      我的公开项目与购买记录 ↗
    </button>
    <BottomNav active="history" />
  </view>
</template>

<style scoped>
.history-privacy {
  min-height: 44px;
  padding: 11px 0;
  color: #496c40;
  font-size: 11px;
}
.history-commerce {
  width: 100%;
  min-height: 44px;
  padding: 12px 0;
  font-size: 12px;
  color: #658a4c;
}
.history-diagnostics {
  display: block;
  color: #8a775f;
  font-size: 10px;
  margin-top: 12px;
}
.history-heading {
  margin: 4px 0 25px;
}
.history-heading .eyebrow {
  font-size: 9px;
}
.history-title {
  font-size: 29px;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: -1px;
  margin: 12px 0;
}
.history-summary {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #93a080;
  margin-bottom: 12px;
}
.history-summary button {
  color: #9fa88e;
  font-size: 10px;
}
.history-card {
  padding: 17px;
  margin-bottom: 13px;
}
.history-open {
  text-align: left;
  width: 100%;
}
.history-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
}
.history-card-top .pill {
  font-size: 8px;
  padding: 2px 7px;
}
.history-date {
  font-size: 9px;
  color: #a1ab94;
}
.history-card-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 14px 0;
  gap: 12px;
}
.history-project-name {
  display: block;
  font-size: 19px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.history-verdict {
  display: block;
  font-size: 9px;
  color: #91a07f;
  margin-top: 5px;
}
.history-score {
  font-size: 34px;
  color: #5f7b45;
  white-space: nowrap;
}
.history-score text {
  font-size: 10px;
  color: #b4bda8;
  margin-left: 4px;
}
.history-quote {
  font-size: 12px;
  line-height: 1.9;
  color: #7d8e6d;
}
.history-card-bottom {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #eef0e7;
  margin-top: 12px;
  padding-top: 11px;
  color: #819a66;
  font-size: 9px;
}
.history-card-bottom button {
  font-size: 9px;
  color: #aab39d;
}
.local-note {
  margin-top: 24px;
  font-size: 10px;
}
.empty-state {
  padding: 18px 0 30px;
}
.empty-illustration {
  position: relative;
  width: 100px;
  height: 100px;
  margin: 0 auto 18px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.empty-paper {
  width: 60px;
  height: 76px;
  border: 1px solid #b6c69d;
  background: #edf2e3;
  border-radius: 8px;
  transform: rotate(-10deg);
  padding: 21px 12px;
}
.empty-paper view {
  height: 3px;
  border-radius: 2px;
  background: #c9d7b4;
  margin-bottom: 8px;
}
.empty-paper view:nth-child(2) {
  width: 70%;
}
.empty-illustration > text {
  position: absolute;
  right: 4px;
  bottom: 8px;
  width: 34px;
  height: 34px;
  background: #d9f18a;
  border-radius: 50%;
  color: #658349;
  font-size: 24px;
  line-height: 34px;
}
.empty-title {
  font-size: 19px;
}
.empty-description {
  font-size: 12px;
}
.example-link {
  font-size: 11px;
  color: #7b965f;
  padding: 17px 0 0;
}
</style>
