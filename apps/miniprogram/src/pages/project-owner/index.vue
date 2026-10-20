<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { PRICE_PRESETS_FEN, formatPrice, parsePrice } from '@pitchcoach/shared';
import type { ProjectOwnerData } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import { changePrice, getOwnerProject, unpublishProject } from '@/lib/commerce-api';
import { removePublication } from '@/lib/publication';

const data = ref<ProjectOwnerData>(),
  price = ref(''),
  tips = ref(false),
  feeConsent = ref(false),
  busy = ref(false),
  error = ref('');
onLoad(async (options) => {
  if (options?.share) await load(options.share);
});
async function load(id: string) {
  busy.value = true;
  try {
    data.value = await getOwnerProject(id);
    price.value = formatPrice(data.value.project.unlockPriceFen);
    tips.value = data.value.project.tipsEnabled;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '项目读取失败';
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!data.value || busy.value) return;
  const fen = parsePrice(price.value);
  if (fen === undefined) {
    error.value = '请输入 0.01–99999.99 元的金额，最多两位小数。';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await changePrice(data.value.project.id, {
      expectedRevision: data.value.project.revision,
      unlockPriceFen: fen,
      tipsEnabled: tips.value,
      serviceFeeConsent: feeConsent.value,
    });
    await load(data.value.project.id);
    uni.showToast({ title: '公开设置已更新', icon: 'success' });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改失败';
  } finally {
    busy.value = false;
  }
}
function stopSharing() {
  if (!data.value) return;
  uni.showModal({
    title: '停止新分享与购买',
    content: '扫码公开页和新购买将停止；已购买者仍可查看其购买时的资料。此前被复制的内容无法追回。',
    confirmText: '停止公开',
    success: async (result) => {
      if (!result.confirm || !data.value) return;
      try {
        busy.value = true;
        await unpublishProject(data.value.project.id);
        removePublication(data.value.project.id);
        await load(data.value.project.id);
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '未能停止分享';
      } finally {
        busy.value = false;
      }
    },
  });
}
</script>
<template>
  <view class="page compact owner-page"
    ><PageHeader back label="公开项目管理" /><view v-if="busy" class="notice"
      >正在读取后台记录…</view
    ><view v-if="error" class="error-box">{{ error }}</view>
    <template v-if="data"
      ><view class="owner-title">{{ data.project.report.projectName }}</view
      ><text class="owner-status">{{ data.active ? '当前公开中' : '已停止新分享与购买' }}</text
      ><view class="stats-grid"
        ><view class="stat"
          ><text>{{ data.project.views }}</text
          ><text>公开页访问次数</text></view
        ><view class="stat"
          ><text>{{ data.project.referrals }}</text
          ><text>引导发起的评估</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.grossPaidFen) }}</text
          ><text>已核验订单标价总额</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.refundFen) }}</text
          ><text>已核对退款</text></view
        ></view
      ><view class="notice"
        >平台统一收款，按扣除退款后的已核实实收逐笔收取 5%
        服务费，按分四舍五入。以下仅统计已对齐的订单，渠道费用与实际结算分列，不代表可提现余额。</view
      >
      <view class="stats-grid"
        ><view class="stat"
          ><text>¥{{ formatPrice(data.verifiedReceiptsFen) }}</text
          ><text>微信已核实实收</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.netReceiptsFen) }}</text
          ><text>可核对订单的退款后实收</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.platformFeeFen) }}</text
          ><text>平台服务费 · 5%</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.projectShareFen) }}</text
          ><text>项目方份额 · 渠道费分配前</text></view
        ><view class="stat"
          ><text>¥{{ formatPrice(data.channelFeeFen) }}</text
          ><text>微信已返回的渠道费用</text></view
        ><view class="stat"
          ><text>{{ data.unreconciledOrders }} / {{ data.channelFeePendingOrders }}</text
          ><text>实收待对账 / 渠道费待对账</text></view
        ></view
      >
      <view v-if="data.active" class="owner-section"
        ><view class="section-title">解锁价格，由你决定</view
        ><view class="price-grid"
          ><button
            v-for="fen in PRICE_PRESETS_FEN"
            :key="fen"
            class="price-option"
            :class="{ selected: parsePrice(price) === fen }"
            @click="price = formatPrice(fen)"
          >
            ¥{{ formatPrice(fen) }}
          </button></view
        ><input
          v-model="price"
          class="price-input"
          type="digit"
          maxlength="9"
          placeholder="自定义金额，单位元"
        /><text class="owner-help"
          >新价格需匹配微信已发布的商品价位；旧订单保留原价格及原资料，价格变化后需要购买者重新确认。</text
        ><button class="choice" @click="tips = !tips">{{ tips ? '☑' : '☐' }} 开启项目礼物</button
        ><button
          class="choice"
          role="checkbox"
          :aria-checked="feeConsent"
          @click="feeConsent = !feeConsent"
        >
          {{ feeConsent ? '☑' : '☐' }} 确认平台收款及 5% 服务费规则</button
        ><button class="primary lime" :disabled="busy" @click="save">保存公开设置</button
        ><button
          class="secondary"
          @click="uni.navigateTo({ url: `/pages/project/index?share=${data!.project.id}` })"
        >
          查看公开页 ↗
        </button></view
      >
      <view class="owner-section"
        ><view class="section-title">参与者与联系线索</view
        ><text class="owner-help"
          >最近 1000
          笔订单。仅展示已核实付款、且参与者主动授权的联系方式；这些信息不向公开页访客展示。</text
        ><view v-for="order in data.orders" :key="order.id" class="lead"
          ><view
            >{{
              order.kind === 'unlock'
                ? '资料解锁'
                : order.gift
                  ? `收到${order.gift.name}`
                  : '历史支持记录'
            }}
            · ¥{{ formatPrice(order.amountFen) }}
            <text>{{
              { pending: '待核对', paid: '已核实', refunded: '已退款', closed: '已关闭' }[
                order.status
              ]
            }}</text></view
          ><text v-if="order.contact" class="lead-contact">{{ order.contact }}</text
          ><text v-if="order.message" class="lead-message">{{ order.message }}</text
          ><text class="lead-date">{{ order.createdAt.slice(0, 10) }} · {{ order.id }}</text></view
        ><text v-if="!data.orders.length" class="owner-help"
          >还没有参与记录。分享公开报告，让合适的人先看到问题，也看到机会。</text
        ></view
      >
      <button v-if="data.active" class="stop-sharing" :disabled="busy" @click="stopSharing">
        停止新分享与购买
      </button>
    </template>
  </view>
</template>
<style scoped>
.owner-title {
  font-size: 27px;
  font-weight: 800;
  margin: 12px 0;
}
.owner-status {
  font-size: 11px;
  color: #879b75;
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 24px 0;
}
.stat {
  padding: 16px;
  background: #eaf0df;
  border-radius: 12px;
}
.stat text:first-child {
  display: block;
  font-size: 22px;
  color: #426643;
}
.stat text:last-child {
  display: block;
  font-size: 10px;
  color: #84976f;
  margin-top: 5px;
}
.owner-section {
  padding: 19px;
  border: 1px solid #dce4d0;
  border-radius: 13px;
  margin: 22px 0;
}
.section-title {
  font-size: 17px;
  font-weight: 700;
  color: #3c5d42;
  margin-bottom: 16px;
}
.price-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.price-option {
  padding: 12px 3px;
  font-size: 17px;
  border: 1px solid #d5e0c4;
  border-radius: 9px;
  color: #5f7f4d;
}
.price-option.selected {
  background: #e3edce;
  border-color: #87a465;
}
.price-input {
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  padding: 10px 12px;
  background: #f0f3e9;
  border-radius: 8px;
  margin: 12px 0;
  font-size: 13px;
}
.owner-help {
  display: block;
  font-size: 11px;
  line-height: 1.9;
  color: #849875;
  margin: 12px 0;
}
.choice {
  font-size: 12px;
  color: #5f7e4f;
  padding: 14px 0;
  text-align: left;
}
.owner-section .secondary {
  margin-top: 13px;
  font-size: 11px;
}
.lead {
  padding: 15px 0;
  border-top: 1px solid #e0e6d7;
  font-size: 12px;
  color: #4d704a;
  line-height: 1.9;
}
.lead > view > text {
  font-size: 10px;
  margin-left: 8px;
  color: #8c9a7e;
}
.lead-contact,
.lead-message,
.lead-date {
  display: block;
  overflow-wrap: anywhere;
  margin-top: 7px;
}
.lead-contact {
  font-weight: 600;
}
.lead-date {
  font-size: 9px;
  color: #9ba68f;
}
.stop-sharing {
  padding: 16px 0;
  font-size: 12px;
  color: #a46b50;
  width: 100%;
}
</style>
