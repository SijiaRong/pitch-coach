<script setup lang="ts">
import type { Investor } from '@pitchcoach/shared';
defineProps<{ investor: Investor; small?: boolean }>();
</script>

<template>
  <view class="avatar" :class="[investor.color, { small }]"
    ><text>{{ investor.mark }}</text
    ><view class="avatar-dot"
  /></view>
</template>

<style scoped>
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: #e8e2f6;
  color: #73618e;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: Georgia, serif;
  font-size: 29px;
  position: relative;
  border: 1px solid #ffffff80;
  flex-shrink: 0;
}
.avatar.small {
  width: 32px;
  height: 32px;
  border-radius: 11px;
  font-size: 20px;
}
.avatar.blue {
  background: #e0eaf5;
  color: #5c7697;
}
.avatar.orange {
  background: #f8e5d4;
  color: #bc814e;
}
.avatar.teal {
  background: #d9ece6;
  color: #4a847b;
}
.avatar.green {
  background: #e3e9d5;
  color: #7b8955;
}
.avatar-dot {
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
}
</style>
