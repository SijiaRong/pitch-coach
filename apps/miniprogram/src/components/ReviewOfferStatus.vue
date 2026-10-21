<script setup lang="ts">
import { computed } from 'vue';
import { formatPrice, offerDescription } from '@/lib/review-offer';
import type { OfferState, ReviewOffer } from '@/lib/review-offer';
const props = defineProps<{ state: OfferState; offer?: ReviewOffer; compact?: boolean }>();
const price = computed(() => props.state === 'ready' && props.offer?.liveAvailable && props.offer.paymentsEnabled ? formatPrice(props.offer.reviewPriceFen) : '');
</script>
<template>
  <view class="offer-status" :class="{ compact, pending: state !== 'ready' || !offer?.liveAvailable }" role="status">
    <template v-if="price"><text class="offer-price">{{ price }}</text><text> / 次真实 AI 评审</text></template>
    <text v-else>{{ offerDescription(state, offer) }}</text>
    <text v-if="price" class="offer-detail">发起三位投资人请求，按实际完成展示</text>
  </view>
</template>
<style scoped>
.offer-status { color: #52664f; font-size: 12px; line-height: 1.75; overflow-wrap: anywhere; }
.offer-price { font-size: 28px; line-height: 1.3; color: #233c31; font-weight: 800; }
.offer-detail { display: block; margin-top: 3px; }
.offer-status.pending { color: #855e2d; }
.offer-status.compact .offer-price { font-size: 21px; }
</style>
