<script setup lang="ts">
import { FUNDING_ROUNDS, INDUSTRIES, INVESTOR_ROSTER, PREFERENCES } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import { OPERATOR_NAME, openWechatPrivacyContract } from '@/lib/privacy';
function copyRepo() {
  uni.setClipboardData({ data: 'https://github.com/SijiaRong/pitch-coach' });
}
</script>

<template>
  <view class="page compact about-page"
    ><PageHeader back label="关于融资教练" /><text class="eyebrow">BUILT FOR BETTER QUESTIONS</text
    ><view class="about-title">真话，<br />是最好的路演彩排。</view
    ><text class="about-intro"
      >PitchCoach
      是一个开源的创业项目自检工具。它不能替你做出投资决定，但可以帮你在真正路演前，把那些难回答的问题先问一遍。</text
    >
    <view class="privacy-entry">
      <view class="privacy-entry-title">资料处理与隐私</view>
      <text>DeepSeek 评估 · 报告保存在本机 · 同意可撤回</text>
      <view class="privacy-entry-actions">
        <button @click="uni.navigateTo({ url: '/pages/privacy/index' })">隐私保护指引 ↗</button>
        <button @click="uni.navigateTo({ url: '/pages/privacy/index?section=terms' })">
          使用须知 ↗
        </button>
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="wechat-privacy" @click="openWechatPrivacyContract">
        微信平台隐私保护指引 ↗
      </button>
      <!-- #endif -->
    </view>
    <view class="about-section"
      ><view class="about-section-title">它怎么打分</view
      ><text
        >{{ FUNDING_ROUNDS.length }} 个融资轮次 × {{ INDUSTRIES.length }} 个领域 ×
        {{ PREFERENCES.length }} 种投资偏好，共 {{ INVESTOR_ROSTER.length }} 位专项 AI 教练。
        每场邀请三种不同偏好的教练，分别审阅八个维度；可在提交页更换组合。行业与轮次影响证据要求和评分权重，偏好影响追问重点。
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
    <view class="about-section"
      ><view class="about-section-title">资料会去哪里</view
      ><text
        >你选择并上传的 BP 文件仅发送至我们的后台提取文字；开始评估前，需要你单独同意将项目文字交给
        DeepSeek。文件选择与相册保存使用微信按需授权，拒绝后仍可浏览示例。</text
      ><text
        >普通评估的原始文件与正文不写入应用数据库，不会自动公开。评估过程中资料会存在后台内存中；任务完成后的报告缓存最多保留
        10 分钟，客户端领取后会请求删除。错误日志不记录 BP、密钥或模型完整响应。</text
      ><text
        >当前 AI 服务接收方为
        DeepSeek。其处理规则与保存期限须结合服务条款及实际合作约定；请先脱敏，不要提交商业秘密或无权使用的资料。</text
      ><text
        >报告默认保存在当前设备，最多 20
        份。你单独确认公开后，完整评估及另行授权的解锁资料、联系人与订单会持久保存在后台，私密内容加密。清理本机记录不等于停止分享或删除后台及模型方记录。</text
      ></view
    >
    <view class="about-section"
      ><view class="about-section-title">分享由你决定</view
      ><text
        >分享海报由本机生成，默认隐藏项目名称，展示参考分、受控文案、风险类别与数量、条件性失败情景和维度摘要；不包含
        BP
        原文摘录、详细追问或财务金额。你预览并确认公开完整评估后，可添加扫码入口，免费查看完整意见与摘录；这部分公开内容无需付费。未公开时入口只打开首页。</text
      ><text
        >投资人可付费访问你另行确认的完整资料正文及联系方式；围观者可自愿打赏并授权留下联系渠道。平台统一收款，按退款后的已核实实收逐笔收取
        5%
        服务费，渠道费用与结算另行对账。可在“我的公开项目与购买记录”停止新分享，已被复制或购买的资料无法追回。</text
      ><text
        >优先点击“分享到朋友圈”，再在微信图片分享菜单中选择朋友圈并确认发布。需要微信支持对应能力；模拟器、浏览器或旧版微信可能只支持预览。保存图片保留为次要选项，取消分享不会自动保存或发布。</text
      ></view
    >
    <view class="about-section"
      ><view class="about-section-title">犀利的边界</view
      ><text
        >点评针对项目与商业逻辑，角色均为虚构 AI
        投资人。所有评估和“是否投资”结论均是模拟意见，仅用于创业项目自检，不代表真实机构的投资意向、投资承诺或成功概率。</text
      ><text
        >演示报告使用虚构项目与固定评分，不会伪装成真实 AI 调用。真实评估失败时会明确报错。</text
      ></view
    >
    <view class="open-source-card"
      ><text class="eyebrow">OPEN SOURCE, OPEN QUESTIONS.</text><view>好的问题，值得一起打磨。</view
      ><text>{{ OPERATOR_NAME ? `${OPERATOR_NAME} · ` : '' }}开源软件 · MIT License · v0.1.0</text
      ><button class="secondary" @click="copyRepo">复制 GitHub 仓库地址 ↗</button></view
    >
  </view>
</template>

<style scoped>
.privacy-entry {
  margin-top: 22px;
  padding: 15px;
  border-radius: 12px;
  background: #eaf0de;
}
.privacy-entry-title {
  font-size: 14px;
  font-weight: 700;
}
.privacy-entry > text {
  display: block;
  font-size: 11px;
  color: #5c714f;
  margin-top: 6px;
  line-height: 1.8;
}
.privacy-entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 6px;
}
.privacy-entry-actions button,
.wechat-privacy {
  min-height: 44px;
  padding: 10px 0;
  font-size: 12px;
  text-align: left;
  color: #2f684e;
}
.wechat-privacy {
  font-size: 11px;
}
.about-page > .eyebrow {
  font-size: 8px;
}
.about-title {
  font-size: 35px;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: -1.3px;
  margin: 12px 0 18px;
}
.about-intro {
  font-size: 12px;
  color: #849773;
  line-height: 2;
}
.about-section {
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid #e0e6d4;
}
.about-section-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 13px;
}
.about-section > text {
  display: block;
  font-size: 11px;
  color: #8d9c7c;
  line-height: 2;
  margin-bottom: 11px;
}
.open-source-card {
  margin-top: 30px;
  background: #eaf0de;
  border-radius: 15px;
  padding: 20px;
}
.open-source-card .eyebrow {
  font-size: 7px;
  color: #8fa374;
}
.open-source-card > view {
  font-size: 17px;
  font-weight: 700;
  margin-top: 12px;
}
.open-source-card > text:not(.eyebrow) {
  display: block;
  font-size: 10px;
  color: #99aa82;
  margin: 8px 0 18px;
}
.open-source-card .secondary {
  border-color: #d4dfc0;
  font-size: 11px;
}
</style>
