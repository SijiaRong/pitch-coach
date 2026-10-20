<script setup lang="ts">
defineProps<{ active: 'home' | 'pitch' | 'history' }>();
const items = [
  { id: 'home', label: '首页', icon: '◈', url: '/pages/index/index' },
  { id: 'pitch', label: '开始评估', icon: '↗', url: '/pages/pitch/index' },
  { id: 'history', label: '我的报告', icon: '▤', url: '/pages/history/index' },
];
const go = (url: string) => uni.reLaunch({ url });
</script>

<template>
  <view class="bottom-nav">
    <button
      v-for="item in items"
      :key="item.id"
      class="nav-item"
      :class="{ active: active === item.id }"
      :aria-label="item.label"
      :aria-current="active === item.id ? 'page' : undefined"
      @click="active !== item.id && go(item.url)"
    >
      <text class="nav-icon">{{ item.icon }}</text
      ><text>{{ item.label }}</text
      >
    </button>
  </view>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 560px;
  margin: 0 auto;
  background: #fafbf5;
  border-top: 1px solid #e5e7dd;
  display: flex;
  padding: 8px 16px calc(env(safe-area-inset-bottom) + 8px);
  gap: 8px;
  z-index: 30;
}
.nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  flex-direction: column;
  color: #626d64;
  font-size: 12px;
  min-height: 52px;
  padding: 4px 6px;
  border-radius: 12px;
  gap: 0;
  position: relative;
}
.nav-item.active {
  color: #2f684e;
  font-weight: 700;
  background: #eaf0e3;
}
.nav-icon {
  font-size: 22px;
  line-height: 29px;
}
</style>
