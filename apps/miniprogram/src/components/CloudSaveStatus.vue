<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { EvaluationReport } from '@pitchcoach/shared';
import { hasWechatSession, ApiFailure } from '@/lib/api';
import { getAccount, getCloudReport, saveCloudReport } from '@/lib/account-api';
const props = defineProps<{ report: EvaluationReport }>();
const state = ref<'local' | 'saved' | 'retry' | 'checking'>('local'),
  busy = ref(false),
  message = ref('');
onMounted(async () => {
  if (props.report.mode === 'demo' || !hasWechatSession()) return;
  state.value = 'checking';
  let syncEnabled = false;
  try {
    const account = await getAccount();
    syncEnabled = account.cloudSyncEnabled;
    await getCloudReport(props.report.id);
    state.value = 'saved';
  } catch (cause) {
    if (
      cause instanceof ApiFailure &&
      (cause.code === 'CLOUD_NOT_CONFIGURED' ||
        cause.code === 'UNAUTHORIZED' ||
        (cause.code === 'CLOUD_REPORT_NOT_FOUND' && !syncEnabled))
    ) {
      state.value = 'local';
      return;
    }
    state.value = 'retry';
    message.value =
      cause instanceof ApiFailure && cause.code === 'CLOUD_REPORT_NOT_FOUND'
        ? '报告尚未同步'
        : '暂无法确认云端状态';
  }
});
async function save() {
  busy.value = true;
  try {
    await saveCloudReport(props.report);
    state.value = 'saved';
    message.value = '';
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : '同步未完成';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="cloud-status" :class="{ saved: state === 'saved' }"
    ><text>{{
      state === 'saved'
        ? '☁ 已加密保存到云端'
        : state === 'checking'
          ? '正在核对云端保存…'
          : state === 'retry'
            ? message
            : props.report.mode === 'demo'
              ? '虚构示例 · 保存在本机'
              : '保存在本机'
    }}</text
    ><button v-if="state === 'retry'" :disabled="busy" @click="save">
      {{ busy ? '同步中…' : '重试同步 →' }}</button
    ><button
      v-else-if="state === 'local' && report.mode !== 'demo'"
      @click="uni.reLaunch({ url: '/pages/history/index' })"
    >
      开启云端保存 →
    </button></view
  >
</template>
<style scoped>
.cloud-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: #8b997e;
  margin: 12px 0;
  line-height: 1.8;
}
.cloud-status.saved {
  color: #5d7f50;
}
.cloud-status > button {
  font-size: 11px;
  color: #5c7a4e;
  min-height: 40px;
}
.cloud-status > text {
  overflow-wrap: anywhere;
}
</style>
