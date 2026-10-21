<script setup lang="ts">
import { nextTick } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import ReviewOfferStatus from '@/components/ReviewOfferStatus.vue';
import { useReviewOffer } from '@/lib/review-offer';
import { ABOUT_SECTIONS } from '@/lib/share-entry';
import { FUNDING_ROUNDS, INDUSTRIES, INVESTOR_ROSTER, PREFERENCES } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import { OPERATOR_NAME, openWechatPrivacyContract } from '@/lib/privacy';
const { state, offer, load } = useReviewOffer();
onShow(() => {
  void load();
});
onLoad((options) => {
  const section = options?.section;
  if (
    typeof section === 'string' &&
    ABOUT_SECTIONS.includes(section as (typeof ABOUT_SECTIONS)[number])
  )
    void nextTick(() => jumpTo(section));
});
function copyContact() {
  if (offer.value?.supportContact) uni.setClipboardData({ data: offer.value.supportContact });
}
function copyRepo() {
  uni.setClipboardData({ data: 'https://github.com/SijiaRong/pitch-coach' });
}
function jumpTo(section: string) {
  uni.pageScrollTo({ selector: `#about-${section}`, duration: 220 });
}
</script>

<template>
  <view class="page compact about-page"
    ><PageHeader back label="使用说明与常见问题" />
    <view class="about-title">先了解规则，<br />再安心开始。</view>
    <text class="about-intro"
      >AI投了么是一款创业项目自检工具。投资人是按行业与轮次设定的 AI
      角色（非真人），评审只基于你主动提交的资料。</text
    >
    <view class="privacy-entry">
      <view class="about-section-title">资料处理与隐私</view>
      <text>{{ OPERATOR_NAME }} · DeepSeek 评估 · 同意可撤回</text>
      <button @click="uni.navigateTo({ url: '/pages/privacy/index' })">隐私保护指引 →</button>
      <button @click="uni.navigateTo({ url: '/pages/privacy/index?section=terms' })">
        使用须知 →
      </button>
      <!-- #ifdef MP-WEIXIN -->
      <button @click="openWechatPrivacyContract">微信平台隐私保护指引 →</button>
      <!-- #endif -->
    </view>
    <view class="about-shortcuts"
      ><button @click="jumpTo('billing')">交付与计次 ↓</button
      ><button @click="jumpTo('orders')">订单与额度 ↓</button
      ><button @click="jumpTo('privacy')">资料处理 ↓</button
      ><button @click="jumpTo('refund')">未用额度退款 ↓</button></view
    >
    <view id="about-billing" class="faq-card">
      <view class="about-section-title">1. 一次评审买到什么？</view>
      <ReviewOfferStatus :state="state" :offer="offer" />
      <text
        >一次真实 AI
        评审请求，包含八个维度的分析与证据缺口、风险、模拟追问和优先改进清单。向三位专项 AI
        投资人发起请求，报告按实际完成展示。</text
      >
      <view class="about-section-title faq-following">2. 部分投资人失败怎么计次？</view>
      <text
        >至少一位投资人生成报告即计 1
        次；全部失败恢复本次额度。部分结果会标明实际完成人数，不会自动补齐。暂时退出不会中断评审，已付但未使用的额度会保留。</text
      >
    </view>
    <view id="about-orders" class="faq-card"
      ><view class="about-section-title">3. 已扣款，但没有看到报告？</view
      ><text
        >先回到评审页点击“查询订单与额度”，若已扣款，请勿重复付款。已有评审时继续原任务或领取报告；有额度时可用于下一次评审。支付结果以服务端向微信支付核实的订单状态为准。</text
      ><text>需要协助时，在评审页复制订单号，再联系实际运营客服。</text
      ><button class="secondary" @click="uni.reLaunch({ url: '/pages/pitch/index' })">
        去查询订单与额度 →
      </button></view
    >
    <view id="about-privacy" class="faq-card"
      ><view class="about-section-title">4. 我的资料会给谁处理？</view
      ><text
        >你主动授权后，项目文字与 BP
        提取正文会发送到后台及部署者配置的模型服务。普通评估的原始文件与完整 BP
        正文不入库；你另行授权的资料正文、公开评估和云端报告按所选用途保存，不会自动公开；评审过程中资料存在后台内存中。</text
      ><text
        >启用付费评审时，完成报告在后台加密暂存，最多 10
        分钟，客户端领取后请求删除。模型服务商的保存与使用规则按其条款执行，请在提交前确认实际服务商与资料使用政策。</text
      ></view
    >
    <view id="about-storage" class="faq-card"
      ><view class="about-section-title">5. 报告保存在什么地方？</view
      ><text
        >报告默认保存在当前设备，最多 20
        份。在“我的”选择微信登录并开启云端保存后，新评估会加密保存，最多 100
        份，可用同一微信身份跨设备查看。已保存报告可直接查看，无需再次付费。超出上限、清理微信缓存或浏览器数据、卸载应用，均可能使本机报告丢失。重要建议可复制保存。</text
      ><text
        >交易记录与报告分开保存。后台保留微信用户标识、订单号、实际订单金额及支付和使用状态，用于履约、核对订单及人工退款；不含完整
        BP。微信支付接收支付必要信息，不接收 BP。</text
      ></view
    >
    <view id="about-refund" class="faq-card"
      ><view class="about-section-title">6. 未使用额度如何退款？</view
      ><text
        >复制订单号联系运营者，由人工核实未使用额度并原路退款。退出页面不会自动退款，未使用额度会保留。已生成至少一位投资人结果的报告按本次评审计次。</text
      ><view class="contact-card"
        ><text v-if="offer?.supportContact">运营客服：{{ offer.supportContact }}</text
        ><text v-else>{{
          state === 'loading' ? '正在获取客服联系信息…' : '暂未取得客服联系信息，请稍后重新获取。'
        }}</text
        ><button v-if="offer?.supportContact" class="secondary" @click="copyContact">
          复制客服联系信息</button
        ><button v-else class="secondary" @click="load()">重新获取服务信息 ↻</button></view
      ></view
    >
    <view id="about-scoring" class="about-section"
      ><view class="about-section-title">它怎么打分</view
      ><text
        >{{ FUNDING_ROUNDS.length }} 个融资轮次 × {{ INDUSTRIES.length }} 个领域 ×
        {{ PREFERENCES.length }} 种投资偏好，共 {{ INVESTOR_ROSTER.length }} 位专项 AI 投资人。
        每场邀请三种不同偏好的投资人，分别审阅八个维度；可在提交页更换组合。行业与轮次影响证据要求和评分权重，偏好影响追问重点。
        产品阶段单独填写，不与融资轮次混用。角色数量代表专项评审定位，不代表同等数量的独立训练模型。</text
      ><text
        >单项取有效评审分数的平均值，再按行业与轮次组合后的权重计算参考分。没有相关资料的维度标为“待补”，不按零分处理。评分证据覆盖低于
        60%，或只有一位投资人完成且未发现阻断红旗时，结论为“资料不足”。只有三人全部完成、至少两人愿意推进且证据覆盖达到
        80%，且不存在阻断红旗、关键待答橙旗或未验证关键假设，才会给出“愿意推进”。</text
      ><text
        >模型提供的评分证据必须能匹配资料原文，否则该项被移除。原文中的商业事实仍是用户陈述，未经独立尽调；这一步不能保证
        AI 完全准确。</text
      ></view
    >
    <view class="about-section">
      <view class="about-section-title">分数之外，先看风险</view>
      <text
        >阻断红旗必须有能匹配资料原文的明确依据，并列出解除条件；任何一位评审识别到有效红旗，都会暂停推进，不能用高分抵消。引用无法核对的红旗会降为待核验橙旗。原文匹配不等于事实已被核实。</text
      >
      <text
        >橙旗列出投资人会问而材料尚未回答的问题、缺失证据和补证方法。关键假设写出可证伪命题、最小实验和通过标准。关键橙旗或假设未解决前，结论不会升级为“愿意推进”。</text
      >
      <text
        >“死亡预言”是关联当前风险与假设的条件性失败情景，附触发条件、预警信号与预防方案，不是确定预言。早期没有收入、硬件或医疗验证周期长，本身不构成阻断红旗。旧报告会标为未检查，需重新评估。</text
      >
    </view>
    <view id="about-sharing" class="about-section"
      ><view class="about-section-title">分享由你决定</view
      ><text
        >分享海报由本机生成，默认隐藏项目名称，展示参考分、受控文案、风险类别与数量、条件性失败情景和维度摘要；不包含
        BP
        原文摘录、详细追问或财务金额。请在预览后确认内容适合公开。默认分享入口打开首页；你另行确认公开后，可在海报加入小程序码，扫码免费查看完整评估。付费资料与联系人须单独授权披露。</text
      ><text
        >点击“打开微信图片分享菜单”后，由你在微信中选择渠道并确认发布。打开菜单不代表已经发布。需要微信支持对应能力；模拟器、浏览器或旧版微信可能只支持预览。保存图片保留为次要选项，取消分享不会自动保存或发布。</text
      ></view
    >
    <view class="about-section"
      ><view class="about-section-title">犀利的边界</view
      ><text
        >点评针对项目与商业逻辑，投资人均为 AI
        角色（非真人）。所有评估和“是否投资”结论均是模拟意见，仅用于创业项目自检，不代表真实机构的投资意向、投资承诺或成功概率。</text
      ><text
        >评分完全由 AI 依据你提交的资料逐项给出，不会因付费、分享或公开而调整；海报与公开页展示的分数与报告一致。评估失败时会明确报错。</text
      ></view
    >
    <view class="open-source-card"
      ><text class="eyebrow">SOURCE AVAILABLE</text><view>源码与使用许可</view
      ><text>源码允许个人非商业自用；商用需另行授权。</text
      ><text>PolyForm Noncommercial 1.0.0 · v0.1.0</text
      ><button class="secondary" @click="copyRepo">复制源码仓库地址 ↗</button></view
    >
  </view>
</template>

<style scoped>
.privacy-entry {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #dfe5d7;
  border-radius: 16px;
  background: #edf2e5;
}
.privacy-entry > text {
  display: block;
  font-size: 12px;
  line-height: 1.85;
  color: #626d64;
}
.privacy-entry button {
  display: block;
  min-height: 44px;
  padding: 10px 0;
  text-align: left;
  font-size: 13px;
  color: #2f684e;
}
.about-page > .eyebrow {
  font-size: 12px;
}
.about-title {
  font-size: 27px;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: -1.3px;
  margin: 12px 0 18px;
}
.about-intro {
  font-size: 14px;
  color: #596e50;
  line-height: 2;
}
.about-section {
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid #e0e6d4;
  scroll-margin-top: 20px;
}
.about-section-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 13px;
}
.about-section > text {
  display: block;
  font-size: 14px;
  color: #5b6e51;
  line-height: 1.95;
  margin-bottom: 15px;
}
.open-source-card {
  margin-top: 30px;
  background: #eaf0de;
  border-radius: 15px;
  padding: 20px;
}
.open-source-card .eyebrow {
  font-size: 12px;
  color: #64794e;
}
.open-source-card > view {
  font-size: 17px;
  font-weight: 700;
  margin-top: 12px;
}
.open-source-card > text:not(.eyebrow) {
  display: block;
  font-size: 12px;
  color: #65794f;
  margin: 8px 0 18px;
}
.open-source-card .secondary {
  border-color: #d4dfc0;
  font-size: 13px;
}
.about-essentials {
  margin-top: 24px;
  padding: 18px;
  border-radius: 16px;
  background: #eaf0de;
}
.essentials-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
}
.about-essentials > view:not(.essentials-title) {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.8;
  color: #526a47;
}
.essential-label {
  flex-shrink: 0;
  font-weight: 700;
  color: #354f3e;
}
.about-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.about-shortcuts button {
  padding: 12px 8px;
  min-height: 48px;
  font-size: 13px;
  color: #2f684e;
  background: #fff;
  border: 1px solid #dce4d0;
  border-radius: 10px;
}
.faq-card {
  margin-top: 24px;
  border: 1px solid #dfe5d7;
  border-radius: 16px;
  background: #fff;
  padding: 18px;
  scroll-margin-top: 20px;
}
.faq-card > text {
  display: block;
  font-size: 14px;
  line-height: 1.85;
  color: #626d64;
  margin-top: 12px;
}
.faq-card .about-section-title {
  font-size: 18px;
}
.faq-following {
  margin-top: 24px;
}
.faq-card .secondary {
  margin-top: 16px;
}
.contact-card {
  margin-top: 14px;
  font-size: 13px;
  overflow-wrap: anywhere;
  color: #52664f;
}
</style>
