<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ score?: number | null }>();
const values = computed(() =>
  props.score == null ? [] : Array.from({ length: props.score + 1 }, (_, value) => value),
);
const trackStyle = computed(() => ({
  transform: `translateY(-${((props.score ?? 0) * 13) / 10}em)`,
  animationTimingFunction: `steps(${props.score || 1}, end)`,
}));
</script>

<template>
  <view class="score-reveal" role="text" :aria-label="score == null ? '未评分' : `${score} 分`">
    <text v-if="score == null">—</text>
    <view v-else class="score-track" :style="trackStyle" aria-hidden="true">
      <text v-for="value in values" :key="value" class="score-value">{{ value }}</text>
    </view>
  </view>
</template>

<style scoped>
.score-reveal {
  display: inline-block;
  height: 1.3em;
  line-height: 1.3em;
  overflow: hidden;
  vertical-align: bottom;
}
.score-track {
  animation: pitch-score-count 0.9s both;
}
.score-value {
  display: block;
  height: 1.3em;
  line-height: 1.3em;
}
@keyframes pitch-score-count {
  from { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .score-track { animation: none; }
}
</style>
