<script setup lang="ts">
import GiftIcon from './GiftIcon.vue';
import { getGift } from '@pitchcoach/shared';
import type { GiftId } from '@pitchcoach/shared';
defineProps<{ gift: GiftId; demo?: boolean }>();
</script>
<template>
  <view class="gift-celebration" role="status" aria-live="polite"
    ><view class="launch-trail" /><view class="flying-gift"><GiftIcon :gift="gift" large /></view
    ><text>{{ demo ? '演示 · ' : '' }}{{ getGift(gift)?.name }}已送达</text
    ><text class="celebration-sub">{{
      demo ? '没有发生付款' : '为这个项目，添一份向前的力量'
    }}</text></view
  >
</template>
<style scoped>
.gift-celebration {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #f7f8f0f2;
  pointer-events: none;
  animation: gift-arrive 2.2s ease both;
}
.flying-gift {
  animation: gift-launch 2.2s cubic-bezier(0.2, 0.7, 0.25, 1) both;
}
.gift-celebration > text {
  font-size: 23px;
  font-weight: 750;
  margin-top: 26px;
  color: #244c39;
}
.gift-celebration > .celebration-sub {
  font-size: 12px;
  font-weight: 400;
  margin-top: 8px;
  color: #6c7a6a;
}
.launch-trail {
  position: absolute;
  width: 2px;
  height: 140px;
  background: linear-gradient(transparent, #c3d6a6, transparent);
  transform: translateY(75px);
  opacity: 0.55;
}
@keyframes gift-launch {
  0% {
    transform: translateY(100px) scale(0.65);
    opacity: 0;
  }
  35%,
  70% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-140px) scale(0.8);
    opacity: 0;
  }
}
@keyframes gift-arrive {
  0%,
  100% {
    opacity: 0;
  }
  15%,
  80% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gift-celebration {
    animation: none;
  }
  .flying-gift {
    animation: none;
  }
  .launch-trail {
    display: none;
  }
}
</style>
