<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import PageHeader from '@/components/PageHeader.vue';
import { clearHistory, readHistory } from '@/lib/storage';
import {
  AI_RECIPIENT,
  OPERATOR_NAME,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_VERSION,
  hasAIDataConsent,
  openWechatPrivacyContract,
  setAIDataConsent,
} from '@/lib/privacy';

const section = ref('overview');
const agreed = ref(false);
const historyCount = ref(0);
const storageWarning = ref('');
onLoad((options) => {
  if (['overview', 'data', 'ai', 'rights', 'terms'].includes(options?.section || ''))
    section.value = options!.section!;
});
onShow(() => {
  agreed.value = hasAIDataConsent();
  historyCount.value = readHistory().length;
});
function toggleSection(value: string) {
  section.value = section.value === value ? '' : value;
}
function revokeConsent() {
  if (!agreed.value) return;
  const saved = setAIDataConsent(false);
  agreed.value = false;
  storageWarning.value = saved
    ? ''
    : '已在本次使用中撤回。设备存储不可用，请清理小程序缓存以确保下次打开仍保持撤回。';
  uni.showToast({ title: '已撤回 AI 资料处理同意', icon: 'none' });
}
function clearLocalReports() {
  uni.showModal({
    title: '清空本机报告',
    content: '将删除这台设备上的全部报告，无法恢复。已保存到相册或自行分享的图片需另行删除。',
    confirmText: '清空',
    success: (result) => {
      if (!result.confirm) return;
      try {
        clearHistory();
        historyCount.value = 0;
        uni.showToast({ title: '本机报告已清空', icon: 'none' });
      } catch {
        uni.showToast({ title: '清理失败，请稍后重试', icon: 'none' });
      }
    },
  });
}
function copy(value: string) {
  uni.setClipboardData({
    data: value,
    fail: () => uni.showToast({ title: '未能复制，可稍后重试', icon: 'none' }),
  });
}
</script>

<template>
  <view class="page compact privacy-page">
    <PageHeader back label="隐私与使用说明" />
    <view class="privacy-title">你的资料，<br />由你决定。</view>
    <text class="privacy-intro">先了解，再提交。示例浏览不需要同意 AI 资料处理。</text>
    <text class="policy-version">说明版本 {{ PRIVACY_VERSION }}</text>
    <view v-if="OPERATOR_NAME" class="operator-info">运营主体：{{ OPERATOR_NAME }}</view>

    <view class="privacy-summary">
      <view>选择的 BP 仅上传至我们的服务器提取文字。</view>
      <view>开始评估前，由你同意将项目文字交给 {{ AI_RECIPIENT.name }} 处理。</view>
      <view>报告默认保存在本机；公开完整评估和解锁资料须另行确认。</view>
    </view>

    <view class="policy-section">
      <button
        class="section-toggle"
        :aria-expanded="section === 'overview'"
        @click="toggleSection('overview')"
      >
        <text>我们处理哪些信息</text><text>{{ section === 'overview' ? '−' : '+' }}</text>
      </button>
      <view v-if="section === 'overview'" class="section-content">
        <text
          >真实评估时，微信提供登录凭证与用户标识，用于确认请求归属、保护报告访问及限制评估次数。应用会把用户标识转换为内部标识使用，不将它发送给模型服务。</text
        >
        <text
          >你主动填写的项目名称、行业、融资轮次、产品阶段、介绍、评审偏好及可选 BP
          正文，用于生成本次项目评估。上传文件名与文件内容仅用于识别文件类型及提取文字。</text
        >
        <text
          >连接服务时会产生 IP
          地址、接口路径、请求时间及状态等必要网络信息，用于提供服务、排查故障与防止滥用。应用错误日志不记录
          BP 正文、认证密钥或模型完整回复。</text
        >
        <text
          >本机保存最近 20 份报告、会话凭证、公开项目入口和你是否同意当前版本 AI
          资料处理的记录。你主动公开项目、提供解锁资料或参加真实交易时，后台另行保存公开报告、授权资料、微信身份关联、订单及可选联系信息。没有广告或统计
          SDK；不主动读取通讯录、位置、麦克风、相册内容或剪贴板内容。</text
        >
        <text
          >仅在你选择上传文件、保存海报或发送反馈时，使用相应的微信能力。拒绝可选权限，不影响示例浏览和本机报告查看。复制按钮只会把你选择的内容写入剪贴板。</text
        >
      </view>
    </view>

    <view class="policy-section">
      <button
        class="section-toggle"
        :aria-expanded="section === 'data'"
        @click="toggleSection('data')"
      >
        <text>资料流转与保存</text><text>{{ section === 'data' ? '−' : '+' }}</text>
      </button>
      <view v-if="section === 'data'" class="section-content">
        <text
          >选择并上传 BP
          后，文件在我们的服务器提取为文字，你可检查、修改或删减。文件上传不会自动触发 AI
          评估；只有你同意并开始评估时，项目文字才会发送给模型服务。</text
        >
        <text
          >普通评估的原始 BP
          文件与正文不写入应用数据库，不会自动公开。后台仅为本次解析和评估在内存中临时处理；评估任务与报告缓存最多保留
          10 分钟，客户端领取后会请求删除。网络异常时可能保留至到期清理。</text
        >
        <text
          >云端保存需要你单独选择“微信登录并开启云端保存”。报告加密保存在后台，仅所属微信身份可查看，最多
          100
          份。关闭自动保存不删除已有报告；本机和云端副本可分别删除。昵称和角色可选，不额外收集手机号、头像或通讯录。只有你再预览并确认公开后，完整评估才允许扫码免费查看。隐藏标题不自动脱敏正文，评审依据与摘录可能包含项目数据。开启解锁须另行确认提供的完整资料正文和联系方式；这些私密内容加密保存，仅向经核实购买者披露，不会自动交给
          AI。</text
        >
        <text
          >购买资料或送出礼物时，微信接收支付所需的登录关联、商品、金额和订单号；平台保存交易与履约记录。联系方式和留言可选，提交时加密保存；联系信息须另行授权，并仅在核实付款后向项目方展示。平台按退款后的已核实实收收取
          5% 服务费，渠道费用及结算另行核对，不承诺股权、收益或回馈。</text
        >
        <text
          >已完成报告保存到当前设备，最多 20
          份；开启云端保存后，可在同一小程序下用相同微信身份跨设备查看。可逐份删除或一次清空；清理微信缓存或卸载后可能丢失。已保存到相册、复制或自行分享的内容需在相应位置另行管理。</text
        >
        <text
          >清空本机报告不会停止后台公开分享或删除已购买资料。项目方可在“我的项目与礼物记录”停止新分享与购买；已购买者仍可查看购买时的资料快照，核实退款后关闭该笔后续访问。已经看见、保存或复制的信息无法追回。后台授权资料、订单及备份的查询、删除和保存期限，可联系运营方核验处理，必要履约与交易记录按实际要求保留。</text
        >
        <text
          >我们使用境内服务器与 DeepSeek API
          提供当前服务。第三方收到的项目文字不受本机删除操作控制，其处理规则与保存期限须结合其公开条款及实际合作约定；我们不承诺第三方“零留存”或“不用于训练”。必要安全日志按适用法律要求与实际部署规则处理。</text
        >
        <text
          >请先移除身份证号、客户联系方式、账号密码等非必要信息，不要提交商业秘密、未公开敏感资料或无权使用的第三方资料。BP
          是可选项，精简的脱敏介绍也可发起评估。</text
        >
      </view>
    </view>

    <view class="policy-section">
      <button class="section-toggle" :aria-expanded="section === 'ai'" @click="toggleSection('ai')">
        <text>第三方 AI 服务</text><text>{{ section === 'ai' ? '−' : '+' }}</text>
      </button>
      <view v-if="section === 'ai'" class="section-content">
        <text
          >接收方：{{ AI_RECIPIENT.name }}（{{
            AI_RECIPIENT.operator
          }}）。处理目的：根据你提交的项目文字和评审设置，生成评分、问题及改进建议；处理方式：由我们的后台通过
          API 发送文字并接收模型结果。</text
        >
        <text
          >涉及信息：项目名称、介绍、可选 BP
          正文、行业、轮次、阶段与评审设置。不会向模型提供微信登录凭证、用户标识、你的全部聊天记录或本机其他报告。请勿在文字中附带非必要个人信息。</text
        >
        <text
          >这项资料处理需要你在开始评估前单独勾选同意。你可以拒绝或撤回，并继续使用示例及本机报告功能。接收方隐私联系邮箱：{{
            AI_RECIPIENT.privacyEmail
          }}。</text
        >
        <button class="policy-link" @click="copy(AI_RECIPIENT.policyUrl)">
          复制 DeepSeek 隐私政策链接 ↗
        </button>
        <button class="policy-link" @click="copy(AI_RECIPIENT.termsUrl)">
          复制 DeepSeek API 服务协议链接 ↗
        </button>
      </view>
    </view>

    <view class="policy-section">
      <button
        class="section-toggle"
        :aria-expanded="section === 'rights'"
        @click="toggleSection('rights')"
      >
        <text>你的选择与隐私管理</text><text>{{ section === 'rights' ? '−' : '+' }}</text>
      </button>
      <view v-if="section === 'rights'" class="section-content">
        <text
          >提交前可修改或清空项目资料，评估中可取消请求。撤回 AI
          资料处理同意后，不再发起新的真实评估；已完成的处理不会被撤销。清空本机报告不等于删除第三方可能保留的数据。</text
        >
        <button class="policy-link" @click="uni.navigateTo({ url: '/pages/commerce/index' })">
          管理公开项目与购买记录 ↗
        </button>
        <view class="privacy-setting">
          <view
            ><text>AI 资料处理</text
            ><text class="setting-detail">{{ agreed ? '已同意当前版本' : '未同意' }}</text></view
          >
          <button v-if="agreed" class="setting-action" @click="revokeConsent">撤回同意</button>
        </view>
        <text v-if="storageWarning" class="storage-warning" role="alert">{{ storageWarning }}</text>
        <view class="privacy-setting">
          <view
            ><text>本机报告</text
            ><text class="setting-detail"
              >{{ historyCount }} 份 · 可在“我的报告”逐份删除</text
            ></view
          >
          <button v-if="historyCount" class="setting-action" @click="clearLocalReports">
            清空
          </button>
        </view>
        <text
          >本服务没有单独注册的应用账号，无需办理独立账号注销。需要查询、更正、删除服务中涉及的信息，或对资料处理提出投诉，可通过下方渠道联系运营方；为保护资料安全，处理请求时可能需要核验身份。</text
        >
        <text v-if="PRIVACY_CONTACT_EMAIL">运营方隐私联系邮箱：{{ PRIVACY_CONTACT_EMAIL }}</text>
        <button
          v-if="PRIVACY_CONTACT_EMAIL"
          class="policy-link"
          @click="copy(PRIVACY_CONTACT_EMAIL)"
        >
          复制隐私联系邮箱 ↗
        </button>
        <!-- #ifdef MP-WEIXIN -->
        <button class="policy-link" open-type="feedback">意见反馈与隐私问题 ↗</button>
        <button class="policy-link" @click="openWechatPrivacyContract">
          查看微信平台隐私保护指引 ↗
        </button>
        <!-- #endif -->
        <text v-if="!OPERATOR_NAME || !PRIVACY_CONTACT_EMAIL"
          >运营主体及完整联系渠道，可在微信平台隐私保护指引和小程序“更多资料”中查看。</text
        >
        <text
          >如处理目的、接收方或信息范围发生实质变化，会更新本说明并重新取得相应同意。微信权限可通过小程序右上角的设置管理。</text
        >
      </view>
    </view>

    <view class="policy-section">
      <button
        class="section-toggle"
        :aria-expanded="section === 'terms'"
        @click="toggleSection('terms')"
      >
        <text>使用须知与 AI 内容说明</text><text>{{ section === 'terms' ? '−' : '+' }}</text>
      </button>
      <view v-if="section === 'terms'" class="section-content">
        <text
          >融资教练用于创业项目自检。所有教练均为虚构 AI
          角色，与真实人物和投资机构无关；“是否推进”等结论是模拟意见，不代表真实投资意向、投资承诺、估值或成功概率，不构成投资、法律等专业建议。</text
        >
        <text
          >AI
          生成内容可能不准确或遗漏风险，引用匹配不等于事实核实。请结合真实资料、独立尽调及必要的专业意见作出决定。示例报告使用虚构项目与固定评分，不是对你真实项目的评估。</text
        >
        <text
          >请合法使用本人有权提供的脱敏资料，不得侵害他人隐私或知识产权、生成传播违法内容、冒充真实机构或绕过服务限额。分享海报默认隐藏项目名称，发布前请确认内容适合公开。</text
        >
        <text
          >本工具面向成年创业者，不以未成年人为服务对象。未成年人请在监护人指导下浏览示例，不要提交个人信息或敏感资料。</text
        >
      </view>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <button class="platform-privacy" @click="openWechatPrivacyContract">
      微信平台隐私保护指引 ↗
    </button>
    <!-- #endif -->
  </view>
</template>

<style scoped>
.privacy-title {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.5;
  margin: 8px 0 12px;
}
.privacy-intro {
  display: block;
  font-size: 12px;
  color: #63765b;
  line-height: 1.9;
}
.policy-version,
.operator-info {
  display: block;
  font-size: 11px;
  color: #6d7b65;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.privacy-summary {
  background: #eaf0de;
  border-radius: 12px;
  padding: 15px;
  margin: 23px 0 8px;
  font-size: 12px;
  line-height: 1.9;
  color: #405b45;
}
.privacy-summary > view + view {
  margin-top: 7px;
}
.policy-section {
  border-bottom: 1px solid #e0e6d4;
}
.section-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  width: 100%;
  min-height: 60px;
  padding: 17px 0;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
}
.section-toggle > text:last-child {
  color: #76896b;
  flex-shrink: 0;
}
.section-content {
  padding-bottom: 14px;
}
.section-content > text {
  display: block;
  font-size: 12px;
  color: #56664e;
  line-height: 1.95;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
.policy-link,
.platform-privacy {
  min-height: 44px;
  padding: 11px 0;
  font-size: 12px;
  color: #2f684e;
  text-align: left;
}
.platform-privacy {
  margin-top: 20px;
}
.privacy-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 0;
  border-top: 1px solid #e6eadf;
  font-size: 12px;
}
.setting-detail {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #6d7b65;
}
.setting-action {
  min-height: 44px;
  padding: 10px 0 10px 10px;
  font-size: 12px;
  color: #2f684e;
  flex-shrink: 0;
}
.section-content .storage-warning {
  color: #965b3d;
}
</style>
