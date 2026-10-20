<script setup lang="ts">
defineProps<{ back?: boolean; label?: string }>();
const goBack = () =>
  getCurrentPages().length > 1 ? uni.navigateBack() : uni.reLaunch({ url: '/pages/index/index' });
</script>

<template>
  <view class="page-header">
    <button v-if="back" class="header-back" aria-label="返回" @click="goBack">←</button>
    <image
      v-else
      class="brand-mark"
      src="/static/brand/ai-toulema.png"
      mode="aspectFit"
      aria-label="AI投了么"
    />
    <view class="brand-name"><text class="brand-title">{{ label || 'AI投了么' }}</text></view>
    <text v-if="!back" class="brand-purpose">AI 投委会评审</text>
  </view>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  padding: calc(var(--status-bar-height, 0px) + 12px) 0 16px;
}
.brand-mark {
  width: 40px;
  height: 40px;
  background: #202b27;
  border-radius: 11px;
  flex-shrink: 0;
}
.brand-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.brand-title {
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.6px;
}
.brand-purpose {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #7b837b;
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #568c5f;
}
.header-back {
  font-size: 22px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
/* #ifdef MP-WEIXIN */
.open-source {
  display: none;
}
/* #endif */
</style>
