<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  decisionLabel,
  publicDiagnosticSummary,
  getIndustry,
  getRound,
} from '@pitchcoach/shared';
import type { AccountInfo, CloudReportSummary, EvaluationReport } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import BottomNav from '@/components/BottomNav.vue';
import { clearHistory, openReport, readHistory, removeReport } from '@/lib/storage';
import { openReviewEntry } from '@/lib/review-entry';
import { hasWechatSession, clearSession } from '@/lib/api';
import {
  getAccountConfig,
  getAccount,
  updateAccount,
  listCloudReports,
  getCloudReport,
  removeCloudReport,
  saveCloudReport,
  loginAndSync,
} from '@/lib/account-api';
import type { AccountConfig } from '@/lib/account-api';
const local = ref<EvaluationReport[]>([]),
  cloud = ref<CloudReportSummary[]>([]),
  account = ref<AccountInfo>(),
  config = ref<AccountConfig>(),
  tab = ref<'local' | 'cloud'>('local'),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  settings = ref(false);
const roleNames = ['创业者', '投资人', '围观者'];
const roleIndex = computed(() =>
  ['entrepreneur', 'investor', 'supporter'].indexOf(account.value?.role || 'entrepreneur'),
);
const items = computed<CloudReportSummary[]>(() =>
  tab.value === 'cloud'
    ? cloud.value
    : local.value.map((report) => ({
        id: report.id,
        projectName: report.projectName,
        industry: report.industry,
        round: report.round,
        createdAt: report.createdAt,
        score: report.score,
        coverage: report.coverage,
        verdict: report.verdict,
        decisionText: decisionLabel(report),
        diagnosticCounts: publicDiagnosticSummary(report).counts,
      })),
);
const syncable = computed(() => local.value.filter((report) => report.mode === 'live'));
onShow(() => {
  void refresh();
});
const cloudReady = computed(() =>
  Boolean(config.value?.cloudAvailable && config.value?.wechatLoginAvailable),
);
async function refresh() {
  local.value = readHistory();
  error.value = '';
  busy.value = true;
  try {
    config.value = await getAccountConfig();
    if (config.value.cloudAvailable && hasWechatSession()) {
      account.value = await getAccount();
      cloud.value = await listCloudReports();
    } else {
      account.value = undefined;
      cloud.value = [];
      if (tab.value === 'cloud') tab.value = 'local';
    }
  } catch {
    // Config unreachable: show the quiet local-only row instead of an alarming error box.
    if (config.value?.cloudAvailable) error.value = '云端暂时不可用，本机报告仍可查看。';
    else config.value = undefined;
  } finally {
    busy.value = false;
  }
}
async function login() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    account.value = await loginAndSync();
    cloud.value = await listCloudReports();
    tab.value = 'cloud';
    notice.value = '微信已绑定，新评估将自动加密保存。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录未完成';
  } finally {
    busy.value = false;
  }
}
async function toggleCloud() {
  if (!account.value) return;
  busy.value = true;
  error.value = '';
  try {
    account.value = await updateAccount({
      cloudSyncEnabled: !account.value.cloudSyncEnabled,
      cloudStorageConsent: true,
    });
    notice.value = account.value.cloudSyncEnabled
      ? '新评估会加密保存到云端。'
      : '已关闭自动保存，已有云端报告保留。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '设置未保存';
  } finally {
    busy.value = false;
  }
}
function editName() {
  uni.showModal({
    title: '你的称呼',
    editable: true,
    placeholderText: '最多 20 个字',
    content: account.value?.displayName || '',
    confirmText: '保存',
    success: async (result) => {
      if (!result.confirm) return;
      try {
        account.value = await updateAccount({
          displayName: result.content || '',
          cloudStorageConsent: false,
        });
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '保存失败';
      }
    },
  });
}
async function changeRole(event: { detail: { value: string | number } }) {
  try {
    account.value = await updateAccount({
      role: (['entrepreneur', 'investor', 'supporter'] as const)[Number(event.detail.value)],
      cloudStorageConsent: false,
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败';
  }
}
function logout() {
  clearSession();
  account.value = undefined;
  cloud.value = [];
  tab.value = 'local';
  notice.value = '已退出此设备，本机报告仍保留。';
}
async function viewReport(item: CloudReportSummary) {
  if (tab.value === 'local') {
    uni.navigateTo({ url: `/pages/report/index?id=${encodeURIComponent(item.id)}` });
    return;
  }
  busy.value = true;
  try {
    openReport(await getCloudReport(item.id));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '报告读取失败';
  } finally {
    busy.value = false;
  }
}
async function syncLocal() {
  if (!account.value?.cloudSyncEnabled || busy.value) return;
  busy.value = true;
  error.value = '';
  let saved = 0,
    failed = 0,
    last = '';
  try {
    for (const report of syncable.value) {
      try {
        await saveCloudReport(report);
        saved++;
      } catch (cause) {
        failed++;
        last = cause instanceof Error ? cause.message : '同步未完成';
      }
    }
    account.value = await getAccount();
    cloud.value = await listCloudReports();
    notice.value = `已同步 ${saved} 份${failed ? `，${failed} 份未同步：${last}` : ''}。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '同步未完成';
  } finally {
    busy.value = false;
  }
}
function remove(item: CloudReportSummary) {
  const cloudItem = tab.value === 'cloud';
  uni.showModal({
    title: cloudItem ? '删除云端报告' : '删除本机报告',
    content: `「${item.projectName}」将从${cloudItem ? '云端' : '本机'}删除，${cloudItem ? '本机副本' : '云端副本'}及公开项目不受影响。`,
    confirmText: '删除',
    cancelText: '保留',
    success: async (result) => {
      if (!result.confirm) return;
      try {
        if (cloudItem) await removeCloudReport(item.id);
        else removeReport(item.id);
        await refresh();
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '删除失败';
      }
    },
  });
}
function clearLocal() {
  uni.showModal({
    title: '清空本机报告',
    content: '仅删除这台设备上的报告，不会删除云端和公开项目。',
    confirmText: '清空',
    success: (result) => {
      if (result.confirm) {
        clearHistory();
        local.value = [];
      }
    },
  });
}
const dateLabel = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
</script>
<template>
  <view class="page account-page"
    ><PageHeader />
    <view class="account-heading">我的项目档案</view>
    <view v-if="!account && !cloudReady" class="local-only">
      <text class="local-only-icon">▤</text>
      <view class="local-only-copy"><text class="local-only-title">报告保存在这台手机上</text><text class="local-only-sub">{{ busy ? '正在确认云端服务…' : '云端同步暂未开放，无需登录' }}</text></view>
      <button v-if="!busy" class="local-only-retry" @click="refresh">刷新</button>
    </view>
    <view v-else class="account-card">
      <template v-if="account"
        ><view class="profile-row"
          ><view class="avatar">{{ (account.displayName || '我').slice(0, 1) }}</view
          ><view class="profile-copy"
            ><text>{{ account.displayName || '微信用户' }}</text
            ><text>微信已绑定 · {{ account.id.slice(-6) }}</text></view
          ><button class="edit-name" @click="editName">编辑</button></view
        ><view class="profile-settings"
          ><picker :range="roleNames" :value="roleIndex" @change="changeRole"
            ><view>{{ roleNames[roleIndex] }} ⌄</view></picker
          ><button @click="settings = !settings">
            {{ account.cloudSyncEnabled ? '☑ 云端保存已开' : '云端保存已关' }} ⌄
          </button></view
        ></template
      >
      <template v-else
        ><view class="login-orbit"><text>↗</text></view
        ><view class="login-title">换个设备，也能接着看。</view
        ><text class="login-copy">微信绑定身份，新报告加密保存到云端。</text
        ><button
          class="primary lime"
          :disabled="busy || !config?.cloudAvailable || !config?.wechatLoginAvailable"
          @click="login"
        >
          {{
            busy
              ? '正在连接…'
              : config?.cloudAvailable && config?.wechatLoginAvailable
                ? '微信登录并开启云端保存'
                : '云端服务待配置'
          }}</button
        ><text class="login-note">{{
          config?.cloudAvailable
            ? '登录后开启云端保存，完整报告仅你可见。'
            : '当前演示使用本机保存，无需登录。'
        }}</text></template
      >
      <view v-if="settings && account" class="account-details"
        ><text
          >报告可能含项目数据与原文摘录。开启后，新评估加密保存在后台，仅所属微信身份可读取；最多
          100 份。</text
        ><button :disabled="busy" @click="toggleCloud">
          {{ account.cloudSyncEnabled ? '关闭自动云端保存' : '开启云端保存' }} →</button
        ><button
          v-if="syncable.length && account.cloudSyncEnabled"
          :disabled="busy"
          @click="syncLocal"
        >
          同步本机 {{ syncable.length }} 份真实报告 →</button
        ><button @click="logout">退出此设备 →</button
        ><text>关闭自动保存不会删除已有报告。退出后，本机报告仍保留。</text></view
      >
    </view>
    <view v-if="error" class="error-box" role="alert">{{ error }}</view
    ><view v-if="notice" class="notice" role="status">{{ notice }}</view>
    <view class="account-menu"
      ><button @click="uni.navigateTo({ url: '/pages/commerce/index' })">
        <text>↗</text> 项目与礼物</button
      ><button @click="openReviewEntry()"><text>▤</text> 评估与订单</button
      ><button @click="uni.navigateTo({ url: '/pages/privacy/index?section=rights' })">
        <text>◇</text> 隐私设置
      </button></view
    >
    <view class="report-list-heading"
      ><view class="report-tabs"
        ><button :class="{ active: tab === 'local' }" @click="tab = 'local'">
          本机 {{ local.length }}</button
        ><button :class="{ active: tab === 'cloud' }" :disabled="!account" @click="tab = 'cloud'">
          云端 {{ cloud.length }}
        </button></view
      ><button v-if="tab === 'local' && local.length" class="clear-button" @click="clearLocal">
        清空</button
      ><button v-else-if="account" class="clear-button" :disabled="busy" @click="refresh">
        刷新 ↻
      </button></view
    >
    <view v-for="item in items" :key="item.id" class="report-row"
      ><button class="report-open" @click="viewReport(item)">
        <view class="report-top"
          ><text
            >{{ getIndustry(item.industry).shortName }} ·
            {{ getRound(item.round || 'angel').name }}</text
          ><text>{{ dateLabel(item.createdAt) }}</text></view
        ><view class="report-main"
          ><view
            ><view class="report-name">{{ item.projectName }}</view
            ><text class="report-verdict"
              >{{ item.decisionText }} · 覆盖 {{ item.coverage }}%</text
            ></view
          ><text class="report-score mono">{{ item.score ?? '—' }}</text></view
        ><text class="report-risks">{{ item.diagnosticCounts }}</text></button
      ><view class="report-actions"
        ><button @click="viewReport(item)">查看报告 →</button
        ><button
          class="delete-report"
          :aria-label="`删除${item.projectName}`"
          @click="remove(item)"
        >
          删除
        </button></view
      ></view
    >
    <view v-if="!items.length" class="empty-reports"
      ><view>还没有{{ tab === 'cloud' ? '云端' : '本机' }}报告</view
      ><text>{{
        tab === 'cloud'
          ? '开启云端保存后，新评估会自动出现在这里。'
          : '完成第一次评审后，报告会保存在这里。'
      }}</text
      ><button v-if="tab !== 'cloud'" class="primary lime" @click="openReviewEntry()">
        开始第一次评审 ↗
      </button></view
    >
    <text class="storage-note"
      >{{
        tab === 'cloud'
          ? '云端内容按微信身份隔离。'
          : '本机保留最近 20 份报告，清理缓存后可能丢失。'
      }}<text v-if="tab === 'cloud' && account">
        {{ account.reportCount }} / {{ account.reportLimit }}</text
      ></text
    >
    <BottomNav active="history" />
  </view>
</template>
<style scoped>
.account-heading {
  font-size: 28px;
  font-weight: 760;
  letter-spacing: -0.9px;
  margin: 8px 0 23px;
}
.account-card {
  padding: 23px;
  background: #eaf0df;
  border: 1px solid #dfe6d1;
  border-radius: 22px;
  margin-bottom: 20px;
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 13px;
}
.avatar {
  width: 53px;
  height: 53px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #284a36;
  color: #dbeda7;
  border-radius: 18px;
  font-size: 22px;
}
.profile-copy {
  flex: 1;
  min-width: 0;
}
.profile-copy > text {
  display: block;
}
.profile-copy > text:first-child {
  font-size: 19px;
  font-weight: 700;
}
.profile-copy > text:last-child {
  font-size: 11px;
  color: #819271;
  margin-top: 2px;
}
.edit-name {
  font-size: 12px;
  color: #5b7950;
  min-height: 44px;
}
.profile-settings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22px;
  font-size: 12px;
  color: #5d7650;
}
.login-orbit {
  width: 48px;
  height: 48px;
  border: 1px solid #bbcea7;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4c7547;
  margin-bottom: 18px;
  font-size: 25px;
}
.login-title {
  font-size: 22px;
  font-weight: 730;
  letter-spacing: -0.4px;
}
.login-copy {
  display: block;
  font-size: 12px;
  color: #7a8d6a;
  margin: 7px 0 22px;
}
.login-note {
  display: block;
  font-size: 11px;
  color: #7f9070;
  text-align: center;
  margin-top: 10px;
}
.account-details {
  margin-top: 19px;
  border-top: 1px solid #d8e1cc;
  padding-top: 14px;
}
.account-details > text {
  display: block;
  font-size: 11px;
  line-height: 1.9;
  color: #829171;
}
.account-details > button {
  display: block;
  text-align: left;
  min-height: 43px;
  font-size: 12px;
  color: #486b42;
  width: 100%;
}
.account-menu {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 23px 0 26px;
}
.account-menu > button {
  padding: 13px 3px;
  font-size: 11px;
  border: 1px solid #e1e6d8;
  border-radius: 13px;
  background: #fcfcf7;
  min-height: 69px;
}
.account-menu > button > text {
  display: block;
  font-size: 23px;
  line-height: 1.4;
  color: #5c7a4c;
  margin-bottom: 4px;
}
.report-list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 25px 0 18px;
}
.report-tabs {
  display: flex;
  gap: 19px;
}
.report-tabs > button {
  min-height: 44px;
  font-size: 15px;
  color: #95a187;
}
.report-tabs > button.active {
  color: #294f38;
  border-bottom: 2px solid #678d50;
  font-weight: 700;
}
.clear-button {
  font-size: 11px;
  color: #88957c;
  min-height: 44px;
}
.report-row {
  border: 1px solid #e0e7d6;
  border-radius: 17px;
  margin: 12px 0;
  background: #fffef8;
  overflow: hidden;
}
.report-open {
  width: 100%;
  text-align: left;
  padding: 17px;
}
.report-top {
  display: flex;
  justify-content: space-between;
  color: #829274;
  font-size: 10px;
}
.report-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin: 12px 0 6px;
}
.report-name {
  font-size: 17px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.report-verdict {
  display: block;
  font-size: 11px;
  color: #7a8a6f;
  margin-top: 4px;
}
.report-score {
  font-size: 34px;
  color: #477049;
  line-height: 1;
}
.report-risks {
  font-size: 11px;
  color: #8c7959;
}
.report-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 17px;
  border-top: 1px solid #edf0e5;
  font-size: 11px;
  color: #63824e;
}
.report-actions > button {
  min-height: 42px;
}
.report-actions > .delete-report {
  color: #a7a08b;
}
.empty-reports {
  text-align: center;
  padding: 33px 12px;
}
.empty-reports > view {
  font-size: 19px;
  font-weight: 650;
  margin-bottom: 7px;
}
.empty-reports > text {
  display: block;
  font-size: 12px;
  color: #909b83;
  margin-bottom: 22px;
}
.empty-reports > .secondary {
  max-width: 250px;
  margin: auto;
}
.storage-note {
  display: block;
  text-align: center;
  font-size: 10px;
  color: #929d85;
  margin: 24px 0;
}
.account-page .notice {
  font-size: 12px;
}
.local-only { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 16px; background: #edf1e5; animation: rise .4s ease both; }
.local-only-icon { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: #fff; color: #2f684e; }
.local-only-copy { flex: 1; min-width: 0; }
.local-only-title { display: block; font-size: 14px; font-weight: 700; }
.local-only-sub { display: block; font-size: 12px; color: #6a7664; }
.local-only-retry { min-height: 44px; padding: 0 4px; font-size: 13px; color: #2f684e; flex-shrink: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .local-only { animation: none; } }
</style>
