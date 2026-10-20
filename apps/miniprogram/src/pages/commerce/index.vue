<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatPrice } from '@pitchcoach/shared';
import type { CommerceOrder, PrivateProjectPack, PublishedProject } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import { getOrder, getOrderMaterial, myCommerce } from '@/lib/commerce-api';

const tab = ref('projects'),
  projects = ref<(PublishedProject & { active: boolean })[]>([]),
  orders = ref<CommerceOrder[]>([]),
  error = ref(''),
  busy = ref(false),
  material = ref<PrivateProjectPack>(),
  expanded = ref('');
const labels = {
  pending: '待核对支付',
  paid: '支付已核实',
  refunded: '已退款 · 权限撤销',
  closed: '已关闭',
};
onShow(() => {
  void load();
});
async function load() {
  busy.value = true;
  error.value = '';
  try {
    const data = await myCommerce();
    projects.value = data.projects;
    orders.value = data.orders;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '记录读取失败';
  } finally {
    busy.value = false;
  }
}
async function inspect(order: CommerceOrder) {
  error.value = '';
  busy.value = true;
  try {
    const updated = await getOrder(order.id);
    orders.value = orders.value.map((item) => (item.id === updated.id ? updated : item));
    if (updated.kind === 'unlock' && updated.status === 'paid') {
      material.value = await getOrderMaterial(updated.id);
      expanded.value = updated.id;
    } else {
      material.value = undefined;
      expanded.value = '';
      uni.showToast({ title: labels[updated.status], icon: 'none' });
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '未通过访问核验';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="page compact commerce-page"
    ><PageHeader back label="项目与礼物" /><view class="commerce-title"
      >让每一份参与，<br />都有记录。</view
    >
    <view class="commerce-tabs"
      ><button
        class="commerce-tab"
        :class="{ active: tab === 'projects' }"
        @click="tab = 'projects'"
      >
        我的公开项目</button
      ><button class="commerce-tab" :class="{ active: tab === 'orders' }" @click="tab = 'orders'">
        我的购买与礼物
      </button></view
    >
    <view v-if="error" class="error-box" role="alert">{{ error }}</view
    ><view v-if="busy" class="notice">正在核对后台记录…</view>
    <template v-if="tab === 'projects'"
      ><view v-for="project in projects" :key="project.id" class="record-card"
        ><view class="record-title">{{ project.report.projectName }}</view
        ><text class="record-meta"
          >{{ project.active ? '公开中' : '已停止新分享与购买' }} · 解锁价 ¥{{
            formatPrice(project.unlockPriceFen)
          }}</text
        ><button
          class="secondary"
          @click="uni.navigateTo({ url: `/pages/project-owner/index?share=${project.id}` })"
        >
          管理项目与支持者记录 ↗
        </button></view
      ><view v-if="!busy && !projects.length" class="empty-hint"
        >还没有公开项目。先完成评估，再主动选择公开范围与价格。</view
      ></template
    >
    <template v-if="tab === 'orders'"
      ><view v-for="order in orders" :key="order.id" class="record-card"
        ><view class="record-title"
          >{{
            order.kind === 'unlock'
              ? '项目资料解锁'
              : order.gift
                ? `送出${order.gift.name}`
                : '历史支持记录'
          }}
          · ¥{{ formatPrice(order.amountFen) }}</view
        ><text class="record-meta"
          >{{ labels[order.status] }} · {{ order.createdAt.slice(0, 10) }}</text
        ><text class="order-number">订单 {{ order.id }}</text
        ><button class="secondary" :disabled="busy" @click="inspect(order)">
          {{
            order.kind === 'unlock' && order.status === 'paid' ? '查看我购买的资料' : '核对支付状态'
          }}
          ↗</button
        ><view v-if="expanded === order.id && material" class="material"
          ><text>{{ material.overview }}</text
          ><view class="contact">{{ material.contactName }} · {{ material.contactValue }}</view
          ><button
            class="text-link"
            @click="
              expanded = '';
              material = undefined;
            "
          >
            收起资料
          </button></view
        ></view
      ><view v-if="!busy && !orders.length" class="empty-hint"
        >还没有购买或送礼记录。取消、退款和支付结果均以后端核对为准。</view
      ><text class="commerce-note"
        >购买记录在登录的微信身份下保留。已停止公开的项目仍可通过这里查看已购资料；退款后访问权限会被撤销。退款与售后请通过平台订单或运营方渠道发起，iOS
        订单按 App Store 流程处理。</text
      ></template
    >
    <button class="text-link" @click="load">刷新后台记录 ↻</button
    ><button class="text-link" @click="uni.navigateTo({ url: '/pages/project/index?example=ai' })">
      先体验虚构项目的公开页 →
    </button>
  </view>
</template>
<style scoped>
.commerce-title {
  font-size: 29px;
  font-weight: 800;
  line-height: 1.6;
  margin: 10px 0 22px;
}
.commerce-tabs {
  display: flex;
  gap: 15px;
  border-bottom: 1px solid #dbe3cf;
  margin-bottom: 20px;
}
.commerce-tab {
  padding: 12px 0;
  flex: 1;
  font-size: 12px;
  color: #869a74;
}
.commerce-tab.active {
  color: #3f6542;
  border-bottom: 2px solid #779951;
}
.record-card {
  padding: 18px;
  border-radius: 12px;
  background: #edf2e2;
  margin: 16px 0;
}
.record-title {
  font-size: 15px;
  color: #3a5c41;
  font-weight: 700;
  line-height: 1.8;
}
.record-meta,
.order-number {
  display: block;
  font-size: 11px;
  color: #849974;
  line-height: 1.9;
  margin: 8px 0;
}
.order-number {
  font-size: 9px;
  overflow-wrap: anywhere;
}
.record-card .secondary {
  margin-top: 14px;
  font-size: 11px;
}
.empty-hint,
.commerce-note {
  display: block;
  padding: 16px 0;
  font-size: 12px;
  line-height: 2;
  color: #8a9b79;
}
.commerce-note {
  font-size: 10px;
}
.text-link {
  padding: 14px 0;
  font-size: 11px;
  color: #6a8c50;
  width: 100%;
}
.material {
  border-top: 1px solid #d6e0c6;
  margin-top: 20px;
  padding-top: 16px;
  font-size: 12px;
  color: #506f47;
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.contact {
  padding: 12px;
  background: #f8faf2;
  border-radius: 8px;
  margin-top: 15px;
}
</style>
