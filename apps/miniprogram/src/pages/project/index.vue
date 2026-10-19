<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';
import {
  DEFAULT_UNLOCK_FEN,
  INDUSTRY_IDS,
  ROUND_IDS,
  PRICE_PRESETS_FEN,
  decisionLabel,
  formatPrice,
  getIndustry,
  getRound,
  shareIdSchema,
  readDemoScene,
  PREFERENCE_IDS,
  DEFAULT_PREFERENCES,
} from '@pitchcoach/shared';
import type {
  CommerceOrder,
  IndustryId,
  PrivateProjectPack,
  PublishedProject,
  RoundId,
  ViewerRole,
  PreferenceId,
} from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import PublicReport from '@/components/PublicReport.vue';
import {
  createOrder,
  getAccess,
  getOrder,
  getOrderMaterial,
  getProject,
  launchPayment,
} from '@/lib/commerce-api';
import { demoPrivatePack, demoProject, projectPath } from '@/lib/publication';

const project = ref<PublishedProject>(),
  pack = ref<PrivateProjectPack>(),
  role = ref<ViewerRole>('supporter'),
  error = ref(''),
  busy = ref(false),
  kind = ref<'unlock' | 'tip'>(),
  tipAmount = ref<number>(888),
  contact = ref(''),
  message = ref(''),
  contactConsent = ref(false),
  purchaseConsent = ref(false),
  checkoutBusy = ref(false),
  order = ref<CommerceOrder>(),
  notice = ref(''),
  isOwner = ref(false);
let disposed = false,
  requestKey = '',
  requestFingerprint = '';
const demo = computed(() => project.value?.mode === 'demo');
const heading = computed(() => project.value?.report.projectName || '公开项目');
const publicPath = computed(() =>
  !project.value
    ? '/pages/index/index'
    : demo.value
      ? projectPath({
          reportId: '',
          projectId: project.value.id,
          example: project.value.report.industry,
          round: project.value.report.round,
          priceFen: project.value.unlockPriceFen,
          anonymous: project.value.anonymous,
          preferences: project.value.report.preferences,
          unlockEnabled: project.value.unlockEnabled,
          tipsEnabled: project.value.tipsEnabled,
        })
      : `/pages/project/index?share=${project.value.id}`,
);
onLoad(async (options) => {
  busy.value = true;
  try {
    const scene = options?.scene ? decodeURIComponent(options.scene) : undefined;
    const demoScene = scene ? readDemoScene(scene) : undefined;
    if (demoScene)
      project.value = demoProject(
        demoScene.industry,
        demoScene.round,
        demoScene.priceFen,
        demoScene.anonymous,
        demoScene.preferences,
        demoScene,
      );
    else if (options?.share || (scene && scene !== 'demo')) {
      const id = options?.share || scene!;
      shareIdSchema.parse(id);
      project.value = await getProject(id);
    } else {
      const industry = INDUSTRY_IDS.includes(options?.example as IndustryId)
        ? (options!.example as IndustryId)
        : 'ai';
      const round = ROUND_IDS.includes(options?.round as RoundId)
        ? (options!.round as RoundId)
        : 'angel';
      const price = Number(options?.price || DEFAULT_UNLOCK_FEN);
      const selected = options?.preferences?.split(',') as PreferenceId[] | undefined;
      const preferences =
        selected?.length === 3 &&
        new Set(selected).size === 3 &&
        selected.every((id) => PREFERENCE_IDS.includes(id))
          ? selected
          : DEFAULT_PREFERENCES;
      project.value = demoProject(
        industry,
        round,
        Number.isSafeInteger(price) && price >= 1 && price <= 9999999 ? price : DEFAULT_UNLOCK_FEN,
        options?.anonymous !== '0',
        preferences,
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
});
onShareAppMessage(() => ({
  title: `${demo.value ? '虚构示例 · ' : ''}一份敢把红旗摆出来的融资评估`,
  path: publicPath.value,
}));
onShareTimeline(() => ({
  title: '这份融资评估，把最难的问题摆上桌。',
  query: publicPath.value.split('?')[1] || '',
}));
function chooseRole(value: ViewerRole) {
  role.value = value;
  kind.value = undefined;
  purchaseConsent.value = false;
  error.value = '';
}
function openCheckout(value: 'unlock' | 'tip') {
  kind.value = value;
  purchaseConsent.value = false;
  contactConsent.value = false;
  error.value = '';
  notice.value = '';
  order.value = undefined;
  requestKey = '';
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const n = Math.floor(Math.random() * 16);
    return (value === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
async function inspectAccess() {
  if (!project.value) return;
  if (demo.value) {
    pack.value = demoPrivatePack(project.value.report.industry);
    notice.value = '已体验虚构资料展示，未发生付款。';
    return;
  }
  try {
    busy.value = true;
    const access = await getAccess(project.value.id);
    isOwner.value = access.isOwner;
    pack.value = access.privatePack;
    if (!access.unlocked) notice.value = '当前微信用户尚未解锁，可以在“我的购买”核对已有订单。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '权限核对失败';
  } finally {
    busy.value = false;
  }
}
async function syncOrder() {
  if (!order.value) return;
  const checked = await getOrder(order.value.id);
  order.value = checked;
  if (checked.status === 'paid') {
    notice.value =
      checked.kind === 'unlock'
        ? '微信支付已核实，资料已开放。'
        : '微信支付已核实，感谢支持。联系方式仅提供给项目方。';
    if (checked.kind === 'unlock') pack.value = await getOrderMaterial(checked.id);
    kind.value = undefined;
    return true;
  }
  if (checked.status === 'refunded') {
    pack.value = undefined;
    notice.value = '该订单已退款，解锁权限已撤销。';
    return true;
  }
  if (checked.status === 'closed') {
    notice.value = '该订单已关闭，未开放资料。';
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
async function pay() {
  if (!project.value || !kind.value || checkoutBusy.value) return;
  error.value = '';
  if (!purchaseConsent.value) {
    error.value = '请先确认本次购买或支持说明。';
    return;
  }
  if (contact.value && !contactConsent.value) {
    error.value = '留下联系方式前，请同意仅向项目方提供。';
    return;
  }
  checkoutBusy.value = true;
  try {
    if (demo.value) {
      if (kind.value === 'unlock') pack.value = demoPrivatePack(project.value.report.industry);
      notice.value =
        kind.value === 'unlock'
          ? '演示解锁已完成，未扣款，展示的资料与联系方式均为虚构。'
          : '演示打赏已完成，未扣款，也未上传联系方式。';
      kind.value = undefined;
      return;
    }
    const body = {
      kind: kind.value,
      amountFen: kind.value === 'unlock' ? project.value.unlockPriceFen : tipAmount.value,
      expectedRevision: project.value.revision,
      role: role.value,
      contact: contact.value,
      message: message.value,
      shareContactConsent: contactConsent.value,
      purchaseConsent: true as const,
    };
    const fingerprint = JSON.stringify(body);
    if (!requestKey || fingerprint !== requestFingerprint) {
      requestKey = uuid();
      requestFingerprint = fingerprint;
    }
    const result = await createOrder(project.value.id, { ...body, idempotencyKey: requestKey });
    order.value = result.order;
    if (result.order.status === 'paid') {
      await syncOrder();
      return;
    }
    if (!result.payment) throw new Error('该订单暂不可付款，请核对订单状态。');
    const completed = await launchPayment(result.payment);
    if (!completed) {
      notice.value = '你已取消支付；订单结果仍以微信核验为准，可随时在我的购买中查看。';
      await syncOrder();
      return;
    }
    notice.value = '正在向微信核实支付结果，请勿重复付款。';
    for (let i = 0; i < 8 && !disposed; i++) {
      if (await syncOrder()) return;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '微信支付结果仍在确认，请稍后核对订单或前往“我的购买”，不要重复付款。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '未完成支付，请核对订单';
  } finally {
    checkoutBusy.value = false;
  }
}
const startEvaluation = () =>
  project.value &&
  uni.navigateTo({
    url: `/pages/pitch/index?industry=${project.value.report.industry}&round=${project.value.report.round}${demo.value ? '' : `&referral=${project.value.id}`}`,
  });
</script>
<template>
  <view class="page compact project-page"
    ><PageHeader back label="公开项目评估" />
    <view v-if="busy && !project" class="notice">正在读取公开评估…</view
    ><view v-if="error" class="error-box" role="alert">{{ error }}</view>
    <template v-if="project">
      <view class="public-label">{{
        demo ? '虚构演示 · 未真实收款' : '项目方授权公开 · AI 生成评估'
      }}</view
      ><view class="project-title">{{ heading }}</view
      ><text class="project-meta"
        >{{ getIndustry(project.report.industry).name }} /
        {{ getRound(project.report.round).name }}</text
      >
      <view class="public-score"
        ><text class="score mono">{{ project.report.score ?? '—' }}</text
        ><text>/100</text><text class="verdict">{{ decisionLabel(project.report) }}</text></view
      >
      <view class="project-quote">“{{ project.report.headline }}”</view
      ><text class="project-summary">{{ project.report.summary }}</text
      ><view
        class="decision-line"
        v-for="reason in project.report.decisionReasons || []"
        :key="reason"
        >{{ reason }}</view
      >
      <view class="viral-card"
        ><view class="viral-title">看别人的红旗，也照照自己的。</view
        ><text>把你的项目交给 3 位 AI 投资人，先问透，再去路演。</text
        ><button class="primary lime" @click="startEvaluation">
          也给我的项目做一次评估 ↗
        </button></view
      >
      <view class="complete-label">完整评估 · 免费查看</view
      ><PublicReport :report="project.report" />
      <view class="participant-panel"
        ><view class="participant-title">你想怎样参与？</view
        ><view class="role-tabs"
          ><button
            v-for="item in [
              { id: 'supporter', label: '我来围观' },
              { id: 'entrepreneur', label: '我也在创业' },
              { id: 'investor', label: '我是投资人' },
            ]"
            :key="item.id"
            class="role-button"
            :class="{ active: role === item.id }"
            @click="chooseRole(item.id as ViewerRole)"
          >
            {{ item.label }}
          </button></view
        ><text class="participant-help">角色由用户自行声明，不代表平台核验身份或资质。</text>
        <template v-if="role === 'investor' && project.unlockEnabled && !pack"
          ><view class="offer-title">完整资料 + 项目方联系方式</view
          ><text class="participant-help"
            >内容由项目方单独授权提供，包含完整项目正文及联系人。购买不会获得股权、投资收益或任何投资承诺。</text
          ><view class="offer-price">¥ {{ formatPrice(project.unlockPriceFen) }}</view
          ><button
            class="primary lime"
            :disabled="!demo && !project.purchasableUnlock"
            @click="openCheckout('unlock')"
          >
            {{ demo ? '体验资料解锁（不扣款）' : '付费解锁完整资料与联系渠道' }}</button
          ><text v-if="!demo && !project.purchasableUnlock" class="participant-help"
            >该项目或该价位尚未启用收款，暂不扣款。</text
          ><button class="text-action" @click="inspectAccess">
            已购买 / 我是项目方，核对访问权限 ↗
          </button></template
        >
        <template v-if="role === 'supporter' && project.tipsEnabled"
          ><view class="offer-title">给这个项目一点支持</view
          ><text class="participant-help"
            >可自愿留下联系方式，让项目方考虑回馈。打赏不对应股权、收益或确定回馈。</text
          ><view class="tip-grid"
            ><button
              v-for="fen in PRICE_PRESETS_FEN"
              :key="fen"
              class="tip-choice"
              :class="{ selected: tipAmount === fen }"
              :disabled="!demo && !project.purchasableTipPricesFen.includes(fen)"
              @click="
                tipAmount = fen;
                openCheckout('tip');
              "
            >
              ¥ {{ formatPrice(fen) }}
            </button></view
          ><text v-if="!demo && !project.paymentAvailable" class="participant-help"
            >收款尚未启用，四档金额仅供查看，暂不扣款。</text
          ></template
        >
        <template v-if="role === 'entrepreneur'"
          ><view class="offer-title">你的项目，经得起这几问吗？</view
          ><button class="primary lime" @click="startEvaluation">
            上传我的资料，开始评估 ↗
          </button></template
        >
        <view v-if="kind" class="checkout-card"
          ><view class="offer-title"
            >{{ kind === 'unlock' ? '确认解锁资料' : '确认自愿打赏' }} · ¥{{
              formatPrice(kind === 'unlock' ? project.unlockPriceFen : tipAmount)
            }}</view
          ><text class="participant-help"
            >平台统一收款，扣除退款后的已核实实收按笔收取 5% 服务费；项目方份额为其余
            95%，渠道费用另行对账。本页金额即本次支付金额，不额外加收服务费。</text
          ><input
            v-model="contact"
            class="checkout-input"
            maxlength="128"
            placeholder="自愿留下微信、电话或邮箱（可不填）"
          /><textarea
            v-model="message"
            class="checkout-message"
            maxlength="300"
            placeholder="想对项目方说的话（可不填）"
          /><button
            v-if="contact"
            class="consent-choice"
            role="checkbox"
            :aria-checked="contactConsent"
            @click="contactConsent = !contactConsent"
          >
            {{ contactConsent ? '☑' : '☐' }}
            同意将这条联系方式仅提供给项目方，用于本项目沟通，不公开展示。</button
          ><button
            class="consent-choice"
            role="checkbox"
            :aria-checked="purchaseConsent"
            @click="purchaseConsent = !purchaseConsent"
          >
            {{ purchaseConsent ? '☑' : '☐' }}
            {{
              kind === 'unlock'
                ? '我了解购买的是项目方提供的资料访问与联系渠道，不代表投资、收益、会面或回复承诺。'
                : '我了解这是自愿支持，不获得股权、收益或确定回馈，项目方可自愿联系。'
            }}</button
          ><button class="primary lime" :disabled="checkoutBusy" @click="pay">
            {{
              checkoutBusy
                ? '正在核对订单…'
                : demo
                  ? '确认体验（不扣款）'
                  : `确认支付 ¥${formatPrice(kind === 'unlock' ? project.unlockPriceFen : tipAmount)}`
            }}</button
          ><button class="text-action" :disabled="checkoutBusy" @click="kind = undefined">
            暂不参与
          </button></view
        >
        <view v-if="notice" class="notice">{{ notice }}</view
        ><button v-if="order" class="secondary" :disabled="checkoutBusy" @click="check">
          核对这笔订单的支付状态 ↗
        </button>
      </view>
      <view v-if="pack" class="private-material"
        ><view class="participant-title">{{
          demo ? '虚构演示资料' : '你有权查看的完整项目资料'
        }}</view
        ><text class="material-text">{{ pack.overview }}</text
        ><view class="contact-card"
          ><view>{{ pack.contactName }}</view
          ><text
            >{{ { wechat: '微信', phone: '电话', email: '邮箱' }[pack.contactChannel] }}：{{
              pack.contactValue
            }}</text
          ></view
        ><text class="participant-help"
          >请仅用于与本项目有关的沟通，勿转售或公开传播联系方式。</text
        ></view
      >
      <button
        v-if="isOwner"
        class="secondary"
        @click="uni.navigateTo({ url: `/pages/project-owner/index?share=${project!.id}` })"
      >
        管理这个公开项目 ↗</button
      ><button class="text-action" @click="uni.navigateTo({ url: '/pages/commerce/index' })">
        我的公开项目与购买记录 ↗
      </button> </template
    ><button
      v-if="!project && !busy"
      class="primary lime"
      @click="uni.reLaunch({ url: '/pages/index/index' })"
    >
      回到融资教练
    </button>
  </view>
</template>
<style scoped>
.public-label {
  font-size: 10px;
  color: #9b875b;
  background: #f4efdc;
  padding: 8px 11px;
  border-radius: 7px;
  margin: 10px 0 16px;
}
.project-title {
  font-size: 29px;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.project-meta {
  font-size: 11px;
  color: #8b9b7c;
}
.public-score {
  display: flex;
  gap: 10px;
  align-items: baseline;
  background: #263e32;
  color: #a8c194;
  border-radius: 16px;
  padding: 18px 20px;
  margin: 20px 0;
}
.score {
  font-size: 65px;
  color: #d9f18a;
  line-height: 1.2;
}
.verdict {
  margin-left: auto;
  color: #e2d3ae;
  font-size: 15px;
}
.project-quote {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.7;
  margin: 22px 0 14px;
}
.project-summary,
.decision-line {
  display: block;
  font-size: 11px;
  color: #849477;
  line-height: 1.9;
}
.decision-line {
  margin: 6px 0;
}
.viral-card {
  background: #e7eddb;
  border-radius: 14px;
  padding: 19px;
  margin: 25px 0;
}
.viral-title {
  font-size: 17px;
  font-weight: 700;
  color: #3c5b42;
}
.viral-card > text {
  display: block;
  font-size: 11px;
  color: #80906d;
  margin: 8px 0 16px;
  line-height: 1.9;
}
.complete-label {
  font-size: 15px;
  font-weight: 700;
  color: #3e5c43;
  margin-top: 30px;
}
.participant-panel {
  border: 1px solid #dbe3ce;
  padding: 18px;
  border-radius: 15px;
  margin: 20px 0;
}
.participant-title {
  font-size: 18px;
  font-weight: 700;
  color: #35563f;
  margin-bottom: 16px;
}
.role-tabs {
  display: flex;
  gap: 7px;
}
.role-button {
  flex: 1;
  padding: 10px 3px;
  font-size: 11px;
  border: 1px solid #d8e1ca;
  border-radius: 8px;
  color: #80966d;
}
.role-button.active {
  background: #e4edcf;
  color: #385b40;
  border-color: #78955b;
}
.participant-help {
  display: block;
  font-size: 10px;
  color: #8a997a;
  line-height: 1.9;
  margin: 12px 0;
}
.offer-title {
  font-size: 15px;
  font-weight: 700;
  color: #4b6847;
  margin-top: 20px;
  line-height: 1.8;
}
.offer-price {
  font-size: 33px;
  color: #426b43;
  margin: 12px 0;
}
.text-action {
  font-size: 11px;
  color: #698a55;
  text-align: center;
  padding: 16px 0;
  width: 100%;
}
.tip-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin: 16px 0;
}
.tip-choice {
  border: 1px solid #d3dfbf;
  border-radius: 9px;
  padding: 13px 2px;
  font-size: 17px;
  color: #607f4e;
}
.tip-choice.selected {
  background: #e3edce;
  border-color: #8ba66a;
  color: #35583d;
}
.checkout-card {
  border-top: 1px solid #dce4ce;
  margin-top: 24px;
  padding-top: 2px;
}
.checkout-input,
.checkout-message {
  width: 100%;
  padding: 12px;
  background: #f0f3e9;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 12px;
  color: #4d6746;
  margin: 12px 0;
  min-height: 45px;
}
.checkout-message {
  height: 100px;
}
.consent-choice {
  font-size: 11px;
  color: #5e7a50;
  line-height: 1.9;
  text-align: left;
  width: 100%;
  padding: 12px 0;
}
.private-material {
  padding: 20px;
  background: #eaf0df;
  border-radius: 14px;
  margin: 22px 0;
}
.material-text {
  display: block;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 2;
  color: #506f48;
  overflow-wrap: anywhere;
}
.contact-card {
  padding: 15px;
  border-radius: 9px;
  background: #fafbf5;
  margin: 20px 0;
  color: #44663e;
  font-size: 13px;
  overflow-wrap: anywhere;
}
</style>
