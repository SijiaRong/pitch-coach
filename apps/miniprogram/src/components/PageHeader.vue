<script setup lang="ts">
defineProps<{ back?: boolean; label?: string }>();
const goBack = () =>
  getCurrentPages().length > 1 ? uni.navigateBack() : uni.reLaunch({ url: '/pages/index/index' });
</script>

<template>
  <view class="page-header">
    <button v-if="back" class="header-back" aria-label="返回" @click="goBack">←</button>
    <view v-else class="brand-mark">P<text class="brand-dot">.</text></view>
    <view class="brand-name"
      ><text class="brand-en">PitchCoach</text
      ><text class="brand-cn">{{ label || '融资教练' }}</text></view
    >
    <view v-if="!back" class="open-source"><view class="status-dot" /> OPEN SOURCE</view>
  </view>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(var(--status-bar-height, 0px) + 22px) 0 28px;
}
.brand-mark {
  width: 35px;
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #202b27;
  color: #d9f18a;
  border-radius: 11px;
  font-family: Georgia, serif;
  font-weight: 700;
  font-size: 27px;
  line-height: 1;
}
.brand-dot {
  color: #fff;
}
.brand-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.brand-en {
  font-size: 16px;
  font-weight: 750;
  letter-spacing: -0.6px;
}
.brand-cn {
  font-size: 10px;
  color: #7b837b;
}
.open-source {
  margin-left: auto;
  font-size: 8px;
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
  width: 30px;
  text-align: left;
}
/* #ifdef MP-WEIXIN */
.open-source {
  display: none;
}
/* #endif */
</style>
