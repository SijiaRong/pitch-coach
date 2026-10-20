<script setup lang="ts">
import { getGift } from '@pitchcoach/shared';
import type { GiftId } from '@pitchcoach/shared';
defineProps<{ gift: GiftId; active?: boolean; large?: boolean }>();
</script>
<template>
  <view class="gift-icon" :class="[gift, { active, large }]" aria-hidden="true"
    ><view class="gift-halo" /><text>{{ getGift(gift)?.symbol }}</text></view
  >
</template>
<style scoped>
.gift-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 20px;
  background: #edf2e6;
  margin: auto;
  color: #2f684e;
}
.gift-icon > text {
  position: relative;
  font-size: 31px;
  line-height: 1;
}
.gift-icon.booster {
  background: #f5f0dc;
}
.gift-icon.rocket {
  background: #e8ede4;
}
.gift-icon.starship {
  background: #edeaf2;
}
.gift-icon.large {
  width: 104px;
  height: 104px;
  border-radius: 32px;
}
.gift-icon.large > text {
  font-size: 55px;
}
.gift-halo {
  position: absolute;
  inset: 7px;
  border: 1px solid #577a4e1f;
  border-radius: 50%;
}
.active > text {
  animation: gift-hover 1.9s ease-in-out infinite;
}
.active .gift-halo {
  animation: gift-glow 1.9s ease-in-out infinite;
}
@keyframes gift-hover {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-5px) rotate(4deg);
  }
}
@keyframes gift-glow {
  50% {
    transform: scale(1.12);
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active > text,
  .active .gift-halo {
    animation: none;
  }
}
</style>
