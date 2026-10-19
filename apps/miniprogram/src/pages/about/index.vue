<script setup lang="ts">
import { FUNDING_ROUNDS, INDUSTRIES, INVESTOR_ROSTER, PREFERENCES } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
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
    <view class="about-section"
      ><view class="about-section-title">它怎么打分</view
      ><text
        >{{ FUNDING_ROUNDS.length }} 个融资轮次 × {{ INDUSTRIES.length }} 个领域 ×
        {{ PREFERENCES.length }} 种投资偏好，共 {{ INVESTOR_ROSTER.length }} 位专项 AI 教练。
        每场邀请三种不同偏好的教练，分别审阅八个维度；可在提交页更换组合。行业与轮次影响证据要求和评分权重，偏好影响追问重点。
        产品阶段单独填写，不与融资轮次混用。角色数量代表专项评审定位，不代表同等数量的独立训练模型。</text
      ><text
        >单项取有效评审分数的平均值，再按行业与轮次组合后的权重计算参考分。没有相关资料的维度标为“待补”，不按零分处理。评分证据覆盖低于
        60%，或只有一位投资人完成时，结论为“资料不足”。只有三人全部完成、至少两人愿意推进且证据覆盖达到
        80%，才会给出“愿意推进”。</text
      ><text
        >模型提供的评分证据必须能匹配资料原文，否则该项被移除。原文中的商业事实仍是用户陈述，未经独立尽调；这一步不能保证
        AI 完全准确。</text
      ></view
    >
    <view class="about-section"
      ><view class="about-section-title">资料会去哪里</view
      ><text
        >上传前需要你主动同意资料处理。BP 文件发送到你使用的后台服务，提取为文字后参与本次 AI
        评估。扫描件和纯图片暂不支持 OCR。</text
      ><text
        >原始文件与正文不写入应用数据库，不用于公开展示。评估过程中资料会存在后台内存中；任务完成后的报告缓存最多保留
        10 分钟，客户端领取后会请求删除。错误日志不记录 BP、密钥或模型完整响应。</text
      ><text
        >评估需要把项目文字发送给部署者配置的模型服务。模型服务商的保存与使用规则由其服务条款决定；提交前请向部署者确认实际服务商与资料使用政策。</text
      ><text
        >完整报告保存在当前设备，最多 20
        份，不跨设备同步。报告可能包含你的商业信息和原文摘录，请妥善保管。清理本机记录不会删除模型服务商可能保存的数据。</text
      ></view
    >
    <view class="about-section"
      ><view class="about-section-title">分享由你决定</view
      ><text
        >分享海报由本机生成，默认隐藏项目名称，仅显示参考分、金句和维度摘要。请在预览后确认内容适合公开。分享小程序卡片或朋友圈入口只会打开首页，不会附带你的
        BP 或完整报告。</text
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
      ><text>个人开源项目 · MIT License · v0.1.0</text
      ><button class="secondary" @click="copyRepo">复制 GitHub 仓库地址 ↗</button></view
    >
  </view>
</template>

<style scoped>
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
