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
import { openReviewEntry } from '@/lib/review-entry';
import BottomNav from '@/components/BottomNav.vue';
import { clearHistory, openReport, readHistory, removeReport } from '@/lib/storage';

const reports = ref<EvaluationReport[]>([]);
onShow(() => {
  reports.value = readHistory();
});
const dateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
function viewReport(id: string) {
  uni.navigateTo({
    url: `/pages/report/index?id=${encodeURIComponent(id)}`,
    fail: () => uni.showToast({ title: '暂时无法打开报告，请重试', icon: 'none' }),
  });
}
function clear() {
  uni.showModal({
    title: '清空本机报告',
    content: `将删除这台设备上的 ${reports.value.length} 份报告，删除后无法恢复。需要保留时，请先复制改进清单或保存海报。`,
    confirmText: '清空',
    cancelText: '保留记录',
    confirmColor: '#a24c30',
    success: (result) => {
      if (result.confirm) {
        try {
          clearHistory();
          reports.value = [];
          uni.showToast({ title: '本机报告已清空', icon: 'none' });
        } catch {
          uni.showToast({ title: '清空失败，请稍后重试', icon: 'none' });
        }
      }
    },
  });
}
function remove(id: string) {
  const name = reports.value.find((report) => report.id === id)?.projectName || '这份报告';
  uni.showModal({
    title: '删除这份报告',
    content: `将删除「${name}」的本机报告，删除后无法恢复。`,
    confirmText: '删除',
    cancelText: '保留报告',
    confirmColor: '#a24c30',
    success: (result) => {
      if (result.confirm) {
        try {
          removeReport(id);
          reports.value = readHistory();
          uni.showToast({ title: '报告已删除', icon: 'none' });
        } catch {
          uni.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
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
    <button v-if="reports.length" class="secondary new-evaluation" @click="openReviewEntry({ intent: 'new' })">评审新项目 +</button>
    <view v-if="!reports.length" class="empty-state"
      ><view class="empty-illustration"
        ><view class="empty-paper"><view /><view /><view /></view><text>↗</text></view
      ><view class="empty-title">第一份报告，等你开场。</view
      ><view class="empty-description"
        >一个想法，一段介绍。<br />让 AI 投委会帮你把问题想得再透一点。</view
      ><button class="primary lime" @click="openReviewEntry()">
        评审我的项目 ↗</button
      ><button class="example-link" @click="openReport(createDemoReport())">
        先看示例报告 →
      </button></view
    >
    <view v-for="report in reports" :key="report.id" class="history-card surface"
      ><button
        class="history-open"
        :aria-label="`查看${report.projectName}的完整报告`"
        @click="viewReport(report.id)"
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
        ><button class="history-view" @click="viewReport(report.id)">查看完整报告 →</button><button class="history-reassess" @click="openReviewEntry({ report, industry: report.industry, round: report.round })">{{ report.mode === 'demo' ? '评审我的项目' : '补证再评' }} ↗</button><button class="history-delete" :aria-label="`删除${report.projectName}的报告`" @click="remove(report.id)">删除</button></view
      ></view
    >
    <view class="notice local-note"
      >报告仅保存在这台设备，最多保留最近 20
      份。清理微信缓存、浏览器数据或卸载应用后，报告可能丢失。需要长期保留时，可保存海报与改进清单。</view
    >
    <button class="history-privacy" @click="uni.navigateTo({ url: '/pages/privacy/index?section=rights' })">隐私管理与使用说明 ↗</button>
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
.history-diagnostics {
  display: block;
  color: #8a775f;
  font-size: 12px;
  margin-top: 12px;
}
.history-heading {
  margin: 4px 0 25px;
}
.history-heading .eyebrow {
  font-size: 12px;
}
.history-title {
  font-size: 27px;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: -1px;
  margin: 12px 0;
}
.history-summary {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #68775e;
  margin-bottom: 12px;
  align-items: center;
}
.history-summary button {
  color: #68775e;
  font-size: 12px;
  min-height: 44px;
  padding: 8px 0 8px 16px;
}
.new-evaluation {
  margin-bottom: 16px;
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
  flex-wrap: wrap;
}
.history-card-top .pill {
  font-size: 12px;
  padding: 2px 7px;
}
.history-date {
  font-size: 12px;
  color: #6a785f;
  margin-top: 4px;
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
  font-size: 12px;
  color: #607551;
  margin-top: 5px;
}
.history-score {
  font-size: 34px;
  color: #5f7b45;
  white-space: nowrap;
}
.history-score text {
  font-size: 12px;
  color: #718064;
  margin-left: 4px;
}
.history-quote {
  font-size: 14px;
  line-height: 1.9;
  color: #5b7051;
}
.history-card-bottom {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #eef0e7;
  margin-top: 12px;
  padding-top: 4px;
  color: #819a66;
  font-size: 12px;
}
.history-card-bottom button {
  font-size: 12px;
  color: #8c5140;
  min-height: 44px;
  min-width: 56px;
  padding: 10px 0;
}
.history-card-bottom .history-view {
  color: #2f684e;
  text-align: left;
  flex: 1;
  font-weight: 600;
}
.local-note {
  margin-top: 24px;
  font-size: 12px;
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
  font-size: 14px;
}
.example-link {
  font-size: 12px;
  color: #7b965f;
  padding: 17px 0 8px;
  min-height: 48px;
}
.history-card-bottom { flex-wrap: wrap; gap: 4px 12px; }
.history-card-bottom .history-reassess { color: #2f684e; min-height: 44px; padding: 10px 0; }
@media(max-width:360px) { .history-card-bottom .history-view { flex: 1 1 100%; } .history-card-bottom .history-reassess { flex: 1; text-align: left; } }
</style>
