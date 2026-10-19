<script setup lang="ts">
defineProps<{ active: 'home' | 'pitch' | 'history' }>();
const items = [
  { id: 'home', label: '发现', icon: '◈', url: '/pages/index/index' },
  { id: 'pitch', label: '项目评估', icon: '↗', url: '/pages/pitch/index' },
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
      @click="active !== item.id && go(item.url)"
    >
      <text class="nav-icon">{{ item.icon }}</text
      ><text>{{ item.label }}</text
      ><view v-if="active === item.id" class="nav-dot" />
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
  padding: 10px 16px calc(env(safe-area-inset-bottom) + 12px);
  z-index: 30;
}
.nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  flex-direction: column;
  color: #a0a697;
  font-size: 10px;
  gap: 1px;
  position: relative;
}
.nav-item.active {
  color: #2f684e;
  font-weight: 700;
}
.nav-icon {
  font-size: 22px;
  line-height: 29px;
}
.nav-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #2f684e;
  position: absolute;
  bottom: -5px;
}
</style>
