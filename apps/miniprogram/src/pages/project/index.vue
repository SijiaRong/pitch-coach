<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import {
  DEFAULT_UNLOCK_FEN,
  DEFAULT_PREFERENCES,
  INDUSTRY_IDS,
  ROUND_IDS,
  GIFTS,
  getGift,
  getIndustry,
  getRound,
  decisionLabel,
  shareIdSchema,
  readDemoScene,
  panelPreferencesSchema,
  formatPrice,
  publicDiagnosticSummary,
} from '@pitchcoach/shared';
import type {
  CommerceOrder,
  GiftId,
  IndustryId,
  PrivateProjectPack,
  PublishedProject,
  RoundId,
  ViewerRole,
} from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import PublicReport from '@/components/PublicReport.vue';
import GiftIcon from '@/components/GiftIcon.vue';
import GiftCelebration from '@/components/GiftCelebration.vue';
import {
  createOrder,
  getAccess,
  getOrder,
  getOrderMaterial,
  getProject,
  launchPayment,
} from '@/lib/commerce-api';
import { demoPrivatePack, demoProject, projectPath } from '@/lib/publication';
import { SHARE_COVER } from '@/lib/share-entry';
const project = ref<PublishedProject>(),
  pack = ref<PrivateProjectPack>(),
  role = ref<ViewerRole>('supporter');
const busy = ref(false),
  error = ref(''),
  notice = ref(''),
  details = ref(false),
  feeDetails = ref(false),
  contactOpen = ref(false);
const kind = ref<'unlock' | 'gift'>(),
  giftId = ref<GiftId>('rocket'),
  contact = ref(''),
  message = ref(''),
  contactConsent = ref(false),
  purchaseConsent = ref(false),
  checkoutBusy = ref(false),
  order = ref<CommerceOrder>(),
  isOwner = ref(false),
  celebration = ref<GiftId>();
const demo = computed(() => project.value?.mode === 'demo'),
  selectedGift = computed(() => getGift(giftId.value)!);
const amount = computed(() =>
  kind.value === 'unlock' ? project.value?.unlockPriceFen || 0 : selectedGift.value.amountFen,
);
const diagnosis = computed(() =>
  project.value ? publicDiagnosticSummary(project.value.report) : undefined,
);
let disposed = false,
  requestKey = '',
  fingerprint = '',
  celebrationTimer: ReturnType<typeof setTimeout> | undefined;
const publicPath = computed(() =>
  project.value
    ? projectPath({
        reportId: '',
        projectId: project.value.id,
        example: demo.value ? project.value.report.industry : undefined,
        round: project.value.report.round,
        priceFen: project.value.unlockPriceFen,
        anonymous: project.value.anonymous,
        preferences: project.value.report.preferences,
        unlockEnabled: project.value.unlockEnabled,
        tipsEnabled: project.value.tipsEnabled,
      })
    : '/pages/index/index',
);
onLoad(async (options) => {
  busy.value = true;
  try {
    const scene = options?.scene ? decodeURIComponent(options.scene) : undefined,
      example = scene ? readDemoScene(scene) : undefined;
    if (example)
      project.value = demoProject(
        example.industry,
        example.round,
        example.priceFen,
        example.anonymous,
        example.preferences,
        example,
      );
    else if (options?.share || (scene && scene !== 'demo'))
      project.value = await getProject(shareIdSchema.parse(options?.share || scene));
    else {
      const industry = INDUSTRY_IDS.includes(options?.example as IndustryId)
          ? (options!.example as IndustryId)
          : 'ai',
        round = ROUND_IDS.includes(options?.round as RoundId)
          ? (options!.round as RoundId)
          : 'angel';
      const price = Number(options?.price || DEFAULT_UNLOCK_FEN),
        preferences = panelPreferencesSchema.safeParse(options?.preferences?.split(','));
      project.value = demoProject(
        industry,
        round,
        Number.isSafeInteger(price) && price > 0 && price <= 9999999 ? price : DEFAULT_UNLOCK_FEN,
        options?.anonymous !== '0',
        preferences.success ? preferences.data : DEFAULT_PREFERENCES,
        { unlockEnabled: options?.unlock !== '0', tipsEnabled: options?.tips !== '0' },
      );
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '报告未公开或已停止分享';
  } finally {
    busy.value = false;
  }
});
onUnload(() => {
  disposed = true;
  if (celebrationTimer) clearTimeout(celebrationTimer);
});
onShareAppMessage(() => ({
  title: '这份项目评估，把难题摆上桌。',
  path: publicPath.value,
  imageUrl: SHARE_COVER,
}));
onShareTimeline(() => ({
  title: '好项目，经得起追问。',
  query: publicPath.value.split('?')[1] || '',
  imageUrl: SHARE_COVER,
}));
function chooseRole(value: ViewerRole) {
  role.value = value;
  kind.value = undefined;
  error.value = '';
}
function checkout(value: 'unlock' | 'gift', gift?: GiftId) {
  if (checkoutBusy.value) return;
  if (
    order.value?.status === 'pending' &&
    order.value.kind === value &&
    (value === 'unlock' || order.value.gift?.id === gift)
  ) {
    notice.value = '先核对刚才的订单，勿重复付款。';
    void check();
    return;
  }
  kind.value = value;
  contact.value = '';
  message.value = '';
  notice.value = '';
  if (gift) giftId.value = gift;
  purchaseConsent.value = false;
  contactConsent.value = false;
  contactOpen.value = false;
  error.value = '';
  feeDetails.value = false;
  requestKey = '';
  order.value = undefined;
}
function celebrate(id: GiftId) {
  if (celebrationTimer) clearTimeout(celebrationTimer);
  celebration.value = id;
  celebrationTimer = setTimeout(() => (celebration.value = undefined), 2200);
}
async function access() {
  if (!project.value) return;
  try {
    busy.value = true;
    const result = await getAccess(project.value.id);
    isOwner.value = result.isOwner;
    pack.value = result.privatePack;
    if (!result.unlocked) notice.value = '尚未解锁，可到购买记录中核对。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '访问核对失败';
  } finally {
    busy.value = false;
  }
}
async function syncOrder() {
  if (!order.value) return false;
  const current = await getOrder(order.value.id);
  order.value = current;
  if (current.status === 'paid') {
    if (current.kind === 'unlock') {
      pack.value = await getOrderMaterial(current.id);
      notice.value = '付款已核实，资料已开放。';
    } else {
      notice.value = `${current.gift?.name || '礼物'}已送达，感谢支持。`;
      if (current.gift) celebrate(current.gift.id);
    }
    kind.value = undefined;
    return true;
  }
  if (current.status === 'refunded') {
    pack.value = undefined;
    notice.value = '订单已退款，后续资料访问已关闭。';
    return true;
  }
  if (current.status === 'closed') {
    notice.value = '订单已关闭。';
    return true;
  }
  return false;
}
async function check() {
  try {
    checkoutBusy.value = true;
    await syncOrder();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '订单仍在核对';
  } finally {
    checkoutBusy.value = false;
  }
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
async function pay() {
  if (!project.value || !kind.value || checkoutBusy.value) return;
  error.value = '';
  if (!purchaseConsent.value) {
    error.value = '请先确认本次购买说明。';
    return;
  }
  if (contact.value && !contactConsent.value) {
    error.value = '留下联系方式前，请同意仅向项目方提供。';
    return;
  }
  checkoutBusy.value = true;
  try {
    if (demo.value) {
      if (kind.value === 'unlock') {
        pack.value = demoPrivatePack(project.value.report.industry);
        notice.value = '已体验解锁。资料与联系人均为虚构，未扣款。';
      } else {
        notice.value = `演示 · ${selectedGift.value.name}已送达，未扣款，也未上传联系方式。`;
        celebrate(giftId.value);
      }
      kind.value = undefined;
      return;
    }
    const input = {
      kind: kind.value,
      ...(kind.value === 'gift' ? { giftId: giftId.value } : {}),
      amountFen: amount.value,
      expectedRevision: project.value.revision,
      role: role.value,
      contact: contact.value,
      message: message.value,
      shareContactConsent: contactConsent.value,
      purchaseConsent: true as const,
    };
    const next = JSON.stringify(input);
    if (!requestKey || next !== fingerprint) {
      requestKey = uuid();
      fingerprint = next;
    }
    const result = await createOrder(project.value.id, { ...input, idempotencyKey: requestKey });
    order.value = result.order;
    if (result.order.status === 'paid') {
      await syncOrder();
      return;
    }
    if (!result.payment) throw new Error('请先核对订单状态。');
    const completed = await launchPayment(result.payment);
    if (!completed) {
      notice.value = '支付已取消，最终结果可在购买记录中核对。';
      await syncOrder();
      return;
    }
    notice.value = '正在核实付款，请勿重复支付…';
    for (let attempt = 0; attempt < 8 && !disposed; attempt++) {
      if (await syncOrder()) return;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '订单仍在核对，可稍后查看购买记录。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '本次操作未完成';
  } finally {
    checkoutBusy.value = false;
  }
}
function startEvaluation() {
  if (project.value)
    uni.navigateTo({
      url: `/pages/pitch/index?industry=${project.value.report.industry}&round=${project.value.report.round}${demo.value ? '' : `&referral=${project.value.id}`}`,
    });
}
</script>
<template>
  <view class="page compact public-page">
    <PageHeader back label="公开评估" /><view
      v-if="error && !kind"
      class="error-box"
      role="alert"
      >{{ error }}</view
    ><view v-if="busy && !project" class="notice">正在打开报告…</view>
    <template v-if="project">
      <view class="public-meta"
        ><text class="pill" :class="{ demo }">{{ demo ? '虚构示例' : '授权公开' }}</text
        ><text
          >{{ getIndustry(project.report.industry).name }} ·
          {{ getRound(project.report.round).name }}</text
        ></view
      >
      <view class="project-title">{{ project.report.projectName }}</view>
      <view class="score-panel"
        ><view
          ><text class="score mono">{{ project.report.score ?? '—' }}</text
          ><text class="score-unit">/100</text></view
        ><view class="verdict-label">{{ decisionLabel(project.report) }}</view></view
      >
      <view class="project-headline">{{ project.report.headline }}</view
      ><text class="risk-line">{{ diagnosis?.counts }}</text>
      <button class="quiet-link" :aria-expanded="details" @click="details = !details">
        结论依据 {{ details ? '−' : '+' }}</button
      ><view v-if="details" class="decision-details"
        ><text v-for="reason in project.report.decisionReasons" :key="reason">{{
          reason
        }}</text></view
      >
      <view class="memo-heading">完整评估 <text>免费查看</text></view
      ><PublicReport :report="project.report" />
      <view class="participation surface">
        <view class="participation-title">为这个项目，添一点可能。</view>
        <view class="role-tabs"
          ><button
            v-for="item in [
              { id: 'supporter', label: '送礼物' },
              { id: 'entrepreneur', label: '我也在创业' },
              { id: 'investor', label: '我是投资人' },
            ]"
            :key="item.id"
            :class="{ active: role === item.id }"
            @click="chooseRole(item.id as ViewerRole)"
          >
            {{ item.label }}
          </button></view
        >
        <template v-if="role === 'supporter'"
          ><view v-if="project.tipsEnabled" class="gift-grid"
            ><button
              v-for="gift in GIFTS"
              :key="gift.id"
              class="gift-option"
              :aria-label="`${gift.name} ¥${formatPrice(gift.amountFen)}`"
              :disabled="!demo && !project.purchasableTipPricesFen.includes(gift.amountFen)"
              @click="checkout('gift', gift.id)"
            >
              <GiftIcon :gift="gift.id" /><text class="gift-name">{{ gift.name }}</text
              ><text class="gift-price">¥{{ formatPrice(gift.amountFen) }}</text>
            </button></view
          ><text class="small-note">{{
            !project.tipsEnabled
              ? '项目方暂未开启礼物。'
              : demo
                ? '演示礼物，不会扣款。'
                : !project.paymentAvailable
                  ? '礼物收款待配置。'
                  : '礼物是自愿支持，不对应股权或回报。'
          }}</text></template
        >
        <template v-else-if="role === 'investor'"
          ><template v-if="project.unlockEnabled && !pack"
            ><view class="offer-name">完整资料 · 联系项目方</view
            ><text class="small-note">项目方单独授权的正文与联系渠道。</text
            ><view class="unlock-price">¥{{ formatPrice(project.unlockPriceFen) }}</view
            ><button
              class="primary lime"
              :disabled="!demo && !project.purchasableUnlock"
              @click="checkout('unlock')"
            >
              {{ demo ? '体验资料解锁' : '解锁完整资料' }}</button
            ><text class="small-note">{{
              demo
                ? '虚构资料，不扣款。'
                : !project.purchasableUnlock
                  ? '该价位尚未开放收款。'
                  : '身份由本人声明，购买不代表投资。'
            }}</text
            ><button v-if="!demo" class="quiet-link" @click="access">
              已购买？查看资料 →
            </button></template
          ><text v-else-if="!project.unlockEnabled" class="small-note"
            >项目方暂未开放资料解锁。</text
          ></template
        >
        <template v-else
          ><view class="offer-name">也让你的项目，听听真话。</view
          ><button class="primary lime" @click="startEvaluation">评估我的项目 ↗</button></template
        >
      </view>
      <view v-if="notice" class="notice" role="status">{{ notice }}</view
      ><button v-if="order" class="quiet-link" :disabled="checkoutBusy" @click="check">
        核对订单状态 →
      </button>
      <view v-if="pack" class="private-material surface"
        ><view class="memo-heading">{{ demo ? '虚构资料 · 未扣款' : '已解锁资料' }}</view
        ><text class="material-text">{{ pack.overview }}</text
        ><view class="contact-block"
          ><text>{{ pack.contactName }}</text
          ><text
            >{{ { wechat: '微信', phone: '电话', email: '邮箱' }[pack.contactChannel] }} ·
            {{ pack.contactValue }}</text
          ></view
        ><text class="small-note">联系信息仅用于本项目沟通。</text></view
      >
      <view class="viral-card"
        ><text class="viral-title">好项目，经得起追问。</text
        ><text class="small-note">三位 AI 教练，帮你找到下一步。</text
        ><button class="primary lime" @click="startEvaluation">评估我的项目 ↗</button></view
      >
      <button
        v-if="isOwner"
        class="quiet-link"
        @click="uni.navigateTo({ url: `/pages/project-owner/index?share=${project!.id}` })"
      >
        管理公开项目 →</button
      ><button class="quiet-link" @click="uni.navigateTo({ url: '/pages/commerce/index' })">
        我的项目与礼物记录 →
      </button>
    </template>
    <button
      v-if="!project && !busy"
      class="secondary"
      @click="uni.reLaunch({ url: '/pages/index/index' })"
    >
      返回首页
    </button>
    <view
      v-if="kind && project"
      class="checkout-backdrop"
      @click="!checkoutBusy && (kind = undefined)"
      ><view class="checkout-sheet" @click.stop>
        <view class="sheet-top"
          ><text>{{ kind === 'gift' ? '把心意送上路' : '确认资料解锁' }}</text
          ><button aria-label="关闭确认" :disabled="checkoutBusy" @click="kind = undefined">
            ×
          </button></view
        >
        <view v-if="kind === 'gift'" class="gift-detail"
          ><GiftIcon :gift="giftId" active large /><view>{{ selectedGift.name }}</view
          ><text>{{ selectedGift.caption }}</text></view
        >
        <view class="checkout-price"
          >¥{{ formatPrice(amount) }}
          <text>{{ demo ? '演示，不扣款' : '本次实际支付' }}</text></view
        >
        <button class="quiet-link" :aria-expanded="contactOpen" @click="contactOpen = !contactOpen">
          留言与联系方式 <text>选填 {{ contactOpen ? '−' : '+' }}</text>
        </button>
        <view v-if="contactOpen" class="contact-fields"
          ><input
            v-model="contact"
            maxlength="128"
            placeholder="微信、电话或邮箱（选填）"
          /><textarea
            v-model="message"
            maxlength="300"
            placeholder="想对项目方说的话（选填）"
          /><button
            v-if="contact"
            class="consent-choice"
            role="checkbox"
            :aria-checked="contactConsent"
            @click="contactConsent = !contactConsent"
          >
            {{ contactConsent ? '☑' : '☐' }} 同意将联系方式仅提供给项目方
          </button></view
        >
        <button
          class="consent-choice"
          role="checkbox"
          :aria-checked="purchaseConsent"
          @click="purchaseConsent = !purchaseConsent"
        >
          {{ purchaseConsent ? '☑' : '☐' }}
          {{
            kind === 'gift'
              ? '我了解礼物为自愿支持，无股权或回报承诺'
              : '我了解购买的是资料访问，无投资或回复承诺'
          }}
        </button>
        <button
          class="quiet-link fee-link"
          :aria-expanded="feeDetails"
          @click="feeDetails = !feeDetails"
        >
          {{ kind === 'gift' ? '礼物与收款说明' : '购买与收款说明' }}
          {{ feeDetails ? '−' : '+' }}</button
        ><text v-if="feeDetails" class="small-note"
          >{{
            kind === 'gift' ? '礼物为数字展示，无实物配送。' : '购买的是项目方提供的资料访问。'
          }}平台统一收款，按退款后已核实实收收取 5%
          服务费，其余为项目方份额；微信渠道费用和结算另行核对。支持者可自愿留联，项目方可考虑回馈。</text
        >
        <view v-if="error" class="error-box" role="alert">{{ error }}</view
        ><button class="primary lime" :disabled="checkoutBusy" @click="pay">
          {{
            checkoutBusy
              ? '正在核对…'
              : demo
                ? kind === 'gift'
                  ? `体验送${selectedGift.name}（不扣款）`
                  : '体验解锁（不扣款）'
                : kind === 'gift'
                  ? `送出${selectedGift.name} · ¥${formatPrice(amount)}`
                  : `确认支付 · ¥${formatPrice(amount)}`
          }}
        </button>
      </view></view
    >
    <GiftCelebration v-if="celebration" :gift="celebration" :demo="demo" />
  </view>
</template>
<style scoped>
.public-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #788272;
  margin: 6px 0 18px;
}
.project-title {
  font-size: 29px;
  line-height: 1.4;
  font-weight: 760;
  letter-spacing: -0.8px;
  overflow-wrap: anywhere;
}
.score-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #243c31;
  color: #c1d0b1;
  padding: 20px 24px;
  border-radius: 22px;
  margin: 23px 0;
}
.score {
  font-size: 70px;
  line-height: 1;
  color: #d9f18a;
  font-weight: 500;
}
.score-unit {
  font-size: 13px;
  margin-left: 10px;
}
.verdict-label {
  border: 1px solid #809378;
  border-radius: 30px;
  padding: 5px 12px;
  font-size: 13px;
  color: #e9efdf;
}
.project-headline {
  font-size: 21px;
  line-height: 1.6;
  font-weight: 650;
  letter-spacing: -0.3px;
}
.risk-line {
  display: block;
  font-size: 12px;
  margin-top: 12px;
  color: #91634a;
}
.quiet-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 42px;
  color: #537449;
  font-size: 12px;
  gap: 9px;
  text-align: center;
}
.decision-details {
  background: #edf1e7;
  padding: 14px;
  border-radius: 12px;
  margin-bottom: 18px;
}
.decision-details > text {
  display: block;
  font-size: 12px;
  line-height: 1.9;
  color: #6b7962;
  margin: 7px 0;
}
.memo-heading {
  font-size: 17px;
  font-weight: 700;
  margin: 26px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.memo-heading > text {
  font-size: 11px;
  font-weight: 400;
  color: #819175;
}
.participation {
  margin: 20px 0;
  padding: 21px;
}
.participation-title {
  font-size: 18px;
  line-height: 1.6;
  font-weight: 700;
  letter-spacing: -0.3px;
}
.role-tabs {
  display: flex;
  gap: 4px;
  background: #f0f3e9;
  border-radius: 12px;
  padding: 4px;
  margin: 16px 0 23px;
}
.role-tabs > button {
  flex: 1;
  min-height: 40px;
  font-size: 12px;
  border-radius: 9px;
  color: #7d8974;
}
.role-tabs > button.active {
  background: #fff;
  color: #2d553e;
  box-shadow: 0 2px 8px #243b3009;
}
.gift-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}
.gift-option {
  min-width: 0;
  text-align: center;
  transition: transform 0.18s ease;
}
.gift-option:active {
  transform: translateY(-4px);
}
.gift-name {
  display: block;
  font-size: 13px;
  font-weight: 650;
  margin-top: 11px;
}
.gift-price {
  display: block;
  font-size: 10px;
  color: #8a967f;
  margin-top: 3px;
}
.small-note {
  display: block;
  color: #84917a;
  font-size: 12px;
  line-height: 1.85;
  margin: 12px 0;
}
.offer-name {
  font-size: 19px;
  font-weight: 700;
  margin: 13px 0;
}
.unlock-price {
  font-size: 34px;
  margin: 10px 0 18px;
  letter-spacing: -1px;
}
.private-material {
  margin: 20px 0;
  background: #eef3e8;
}
.private-material .memo-heading {
  margin: 0 0 16px;
}
.material-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 2;
  display: block;
}
.contact-block {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin: 20px 0;
}
.contact-block > text {
  display: block;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.contact-block > text:first-child {
  font-weight: 700;
  margin-bottom: 5px;
}
.viral-card {
  padding: 24px;
  background: #eaf0df;
  border-radius: 20px;
  margin: 25px 0 10px;
}
.viral-title {
  font-size: 20px;
  font-weight: 720;
}
.viral-card .primary {
  margin-top: 18px;
}
.checkout-backdrop {
  position: fixed;
  inset: 0;
  background: #1a3026a8;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
.checkout-sheet {
  background: #fbfcf6;
  width: 100%;
  max-width: 520px;
  border-radius: 24px;
  padding: 22px 24px calc(22px + env(safe-area-inset-bottom));
  max-height: 88vh;
  overflow-y: auto;
  animation: sheet-in 0.25s ease-out;
}
.sheet-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 17px;
  font-weight: 700;
}
.sheet-top > button {
  font-size: 25px;
  width: 38px;
  height: 38px;
}
.gift-detail {
  text-align: center;
  margin: 15px 0 9px;
}
.gift-detail > view:nth-child(2) {
  font-size: 24px;
  font-weight: 750;
  margin: 17px 0 4px;
}
.gift-detail > text {
  font-size: 12px;
  color: #7d8b71;
}
.checkout-price {
  text-align: center;
  font-size: 28px;
  margin: 16px 0;
}
.checkout-price > text {
  display: block;
  font-size: 11px;
  color: #89947e;
  letter-spacing: 0;
}
.contact-fields input,
.contact-fields textarea {
  box-sizing: border-box;
  width: 100%;
  background: #eef2e7;
  border: 1px solid #dfe7d3;
  border-radius: 10px;
  padding: 12px;
  font-size: 12px;
  margin: 9px 0;
}
.contact-fields input {
  height: 44px;
}
.contact-fields textarea {
  height: 72px;
}
.consent-choice {
  width: 100%;
  text-align: left;
  font-size: 12px;
  line-height: 1.8;
  min-height: 45px;
  color: #617653;
  padding: 10px 0;
}
.fee-link {
  font-size: 11px;
  margin-bottom: 9px;
  min-height: 34px;
}
.checkout-sheet .primary {
  margin-top: 9px;
}
@keyframes sheet-in {
  from {
    transform: translateY(22px);
    opacity: 0.4;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@media (max-width: 370px) {
  .gift-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .score {
    font-size: 60px;
  }
  .project-title {
    font-size: 25px;
  }
  .checkout-sheet {
    padding-left: 18px;
    padding-right: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gift-option,
  .checkout-sheet {
    animation: none;
    transition: none;
  }
}
</style>
