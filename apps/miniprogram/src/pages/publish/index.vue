<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  DEFAULT_UNLOCK_FEN,
  GIFTS,
  PRICE_PRESETS_FEN,
  formatPrice,
  parsePrice,
  publicReportCopy,
  publishProjectSchema,
} from '@pitchcoach/shared';
import type { EvaluationReport, PrivateProjectPack } from '@pitchcoach/shared';
import PageHeader from '@/components/PageHeader.vue';
import PublicReport from '@/components/PublicReport.vue';
import GiftIcon from '@/components/GiftIcon.vue';
import { findReport } from '@/lib/storage';
import { chooseDocument, uploadDocument } from '@/lib/api';
import { commerceConfig, publishProject } from '@/lib/commerce-api';
import { demoPrivatePack, projectPath, savePublication } from '@/lib/publication';
import type { PublicationLink } from '@/lib/publication';

const report = ref<EvaluationReport>();
const anonymous = ref(true),
  publicConsent = ref(false),
  unlockEnabled = ref(false),
  tipsEnabled = ref(false),
  privateConsent = ref(false),
  feeConsent = ref(false),
  preview = ref(false),
  busy = ref(false),
  uploading = ref(false);
const amount = ref(formatPrice(DEFAULT_UNLOCK_FEN)),
  error = ref(''),
  created = ref<PublicationLink>();
const pack = ref<PrivateProjectPack>({
  overview: '',
  contactName: '',
  contactChannel: 'wechat',
  contactValue: '',
});
const demo = computed(() => report.value?.mode === 'demo');
const previewReport = computed(() =>
  report.value ? publicReportCopy(report.value, anonymous.value) : undefined,
);
onLoad((options) => {
  if (options?.id) report.value = findReport(options.id);
  if (demo.value && report.value) {
    pack.value = demoPrivatePack(report.value.industry);
    unlockEnabled.value = true;
    tipsEnabled.value = true;
  }
});
function selectChannel(event: { detail: { value: string | number } }) {
  pack.value.contactChannel = (['wechat', 'phone', 'email'] as const)[Number(event.detail.value)];
}
async function upload() {
  if (!privateConsent.value) {
    error.value = '请先确认你有权提供这份资料，并同意在解锁后向购买者披露。';
    return;
  }
  try {
    const file = await chooseDocument();
    if (!file) return;
    uploading.value = true;
    const result = await uploadDocument(file.path);
    pack.value.overview = result.text;
    if (result.truncated) error.value = '资料已截断至长度上限，请检查正文是否完整。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '上传失败';
  } finally {
    uploading.value = false;
  }
}
async function publish() {
  if (!report.value || busy.value || created.value) return;
  error.value = '';
  const fen = parsePrice(amount.value);
  if (fen === undefined) {
    error.value = '金额范围为 0.01–99999.99 元，最多两位小数。';
    return;
  }
  if (!publicConsent.value) {
    error.value = '请预览并确认公开完整评估报告。';
    return;
  }
  const checked = publishProjectSchema.safeParse({
    report: report.value,
    anonymous: anonymous.value,
    publicReportConsent: true,
    unlockEnabled: unlockEnabled.value,
    unlockPriceFen: fen,
    privatePack: unlockEnabled.value ? pack.value : undefined,
    privateDisclosureConsent: privateConsent.value,
    tipsEnabled: tipsEnabled.value,
    serviceFeeConsent: feeConsent.value,
  });
  if (!checked.success) {
    error.value = checked.error.issues[0].message;
    return;
  }
  busy.value = true;
  try {
    let link: PublicationLink;
    if (demo.value)
      link = {
        reportId: report.value.id,
        projectId: `demo-${report.value.industry}-${report.value.round}`,
        example: report.value.industry,
        round: report.value.round,
        priceFen: fen,
        anonymous: anonymous.value,
        preferences: report.value.preferences,
        unlockEnabled: unlockEnabled.value,
        tipsEnabled: tipsEnabled.value,
      };
    else {
      const availability = await commerceConfig();
      if (!availability.sharingAvailable)
        throw new Error('公开分享服务尚未启用，请先完成后台持久化与小程序码配置。');
      const project = await publishProject(checked.data);
      link = { reportId: report.value.id, projectId: project.id, anonymous: project.anonymous };
    }
    created.value = link;
    try {
      savePublication(link);
    } catch {
      error.value = '公开设置已完成，但本机未保存入口。请先打开下方公开页，勿重复发布。';
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '公开失败，请重试';
  } finally {
    busy.value = false;
  }
}
const makePoster = () =>
  report.value &&
  created.value &&
  uni.redirectTo({
    url: `/pages/report/index?id=${encodeURIComponent(report.value.id)}&poster=1${created.value.example ? '' : `&publication=${created.value.projectId}`}`,
  });
</script>
<template>
  <view class="page compact publish-page"
    ><PageHeader back label="公开与分享设置" />
    <template v-if="report">
      <view class="publish-title">让真问题，<br />遇见真机会。</view>
      <view v-if="demo" class="notice">虚构演示，不收款，也不公开你的真实资料。</view>
      <template v-if="!created">
        <view class="section-card"
          ><view class="section-title">01 / 扫码免费查看</view
          ><text class="form-help">扫码免费查看完整评估，也能发起自己的评估。</text>
          <button class="choice-row" @click="anonymous = !anonymous">
            <text>{{ anonymous ? '☑' : '☐' }} 隐藏公开页的项目标题</text
            ><text>{{ anonymous ? '匿名' : '显示原名' }}</text>
          </button>
          <text class="form-help"
            >隐藏标题不等于正文脱敏。请检查原文摘录与项目数据，公开后可被查看和转发。</text
          >
          <button class="secondary" @click="preview = !preview">
            {{ preview ? '收起公开内容' : '预览将公开的完整评估' }} ↗
          </button>
          <PublicReport v-if="preview && previewReport" :report="previewReport" />
          <button
            class="consent-choice"
            role="checkbox"
            :aria-checked="publicConsent"
            @click="publicConsent = !publicConsent"
          >
            {{ publicConsent ? '☑' : '☐' }}
            我已核对，确认公开完整评估及原文摘录
          </button>
        </view>
        <view class="section-card"
          ><view class="section-title">02 / 投资人解锁资料</view>
          <button class="choice-row" @click="unlockEnabled = !unlockEnabled">
            <text>{{ unlockEnabled ? '☑' : '☐' }} 开启付费解锁</text>
          </button>
          <template v-if="unlockEnabled"
            ><text class="form-help">购买核实后开放下方资料与联系人。投资人身份由本人声明。</text>
            <text class="field-label">你来定价 · 推荐金额</text
            ><view class="price-grid"
              ><button
                v-for="fen in PRICE_PRESETS_FEN"
                :key="fen"
                class="price-option"
                :class="{ selected: parsePrice(amount) === fen }"
                @click="amount = formatPrice(fen)"
              >
                ¥ {{ formatPrice(fen) }}
              </button></view
            >
            <input
              v-model="amount"
              class="field-input"
              type="digit"
              maxlength="9"
              placeholder="或输入自定义金额，单位元"
            /><text class="form-help"
              >自定义金额需在微信完成对应价位配置后方可实际收款；不会擅自换价。</text
            >
            <button
              class="consent-choice"
              role="checkbox"
              :aria-checked="privateConsent"
              @click="privateConsent = !privateConsent"
            >
              {{ privateConsent ? '☑' : '☐' }}
              我有权提供下方资料与联系人，同意加密保存并向已核实购买者披露
            </button>
            <button v-if="!demo" class="secondary" :disabled="uploading" @click="upload">
              {{ uploading ? '正在提取文字…' : '选择 BP，提取为完整正文' }} ↗
            </button>
            <textarea
              v-model="pack.overview"
              class="pack-textarea"
              :disabled="demo"
              maxlength="50000"
              placeholder="完整项目资料正文。仅向完成解锁的购买者展示，不会自动交给 AI。"
            />
            <input
              v-model="pack.contactName"
              class="field-input"
              :disabled="demo"
              maxlength="40"
              placeholder="项目方联系人姓名"
            />
            <picker :range="['微信', '电话', '邮箱']" :disabled="demo" @change="selectChannel"
              ><view class="field-input"
                >联系方式：{{
                  { wechat: '微信', phone: '电话', email: '邮箱' }[pack.contactChannel]
                }}
                ⌄</view
              ></picker
            >
            <input
              v-model="pack.contactValue"
              class="field-input"
              :disabled="demo"
              maxlength="128"
              placeholder="微信号、电话或邮箱"
            />
          </template>
        </view>
        <view class="section-card"
          ><view class="section-title">03 / 收到一份心意</view
          ><button class="choice-row" @click="tipsEnabled = !tipsEnabled">
            {{ tipsEnabled ? '☑' : '☐' }} 开启项目礼物</button
          ><text class="form-help"
            >火花、助推器、火箭、星舰四种礼物。支持者可自愿留联，方便你考虑回馈；不承诺股权或回报。</text
          ></view
        >
        <view v-if="tipsEnabled" class="gift-preview"
          ><view v-for="gift in GIFTS" :key="gift.id"
            ><GiftIcon :gift="gift.id" /><text>{{ gift.name }}</text></view
          ></view
        >
        <view v-if="unlockEnabled || tipsEnabled" class="section-card"
          ><view class="section-title">04 / 收款与服务费</view
          ><text class="form-help"
            >平台按退款后的已核实实收收取 5%
            服务费，其余为项目方份额。渠道费用及结算另行核对。</text
          ><button
            class="consent-choice"
            role="checkbox"
            :aria-checked="feeConsent"
            @click="feeConsent = !feeConsent"
          >
            {{ feeConsent ? '☑' : '☐' }} 同意平台收款与 5% 服务费规则
          </button></view
        >
        <view v-if="error" class="error-box" role="alert">{{ error }}</view
        ><button class="primary lime" :disabled="busy || uploading" @click="publish">
          {{ busy ? '正在保存公开设置…' : demo ? '体验公开与解锁设置' : '确认公开这份评估' }} ↗
        </button>
        <text class="form-help"
          >开启后，公开报告和你授权的资料包会保存在后台。可在“我的公开项目”停止新分享与购买；已经被复制的内容和已购买资料无法追回。收款后按实际结算方案处理，流水不等于已到账收入。</text
        >
      </template>
      <view v-else class="section-card"
        ><view class="section-title">{{ demo ? '示例公开页已准备好' : '完整评估已公开' }}</view
        ><text class="form-help">{{
          demo
            ? '当前演示不会收款。真实扫码入口需要配置官方小程序码服务。'
            : '免费评估与付费资料已按你选择的范围分开。扫码入口只指向这份公开评估。'
        }}</text
        ><view v-if="error" class="error-box">{{ error }}</view
        ><button class="primary lime" @click="makePoster">生成朋友圈海报 ↗</button
        ><button class="secondary" @click="uni.navigateTo({ url: projectPath(created!) })">
          看看扫码者会看到什么 ↗
        </button></view
      > </template
    ><view v-else class="empty-state">本机没有这份评估，请先完成一次评估或查看示例。</view>
  </view>
</template>
<style scoped>
.gift-preview {
  display: flex;
  justify-content: space-around;
  gap: 8px;
  margin: 20px 0;
}
.gift-preview > view > text {
  display: block;
  text-align: center;
  font-size: 12px;
  color: #70835e;
  margin-top: 8px;
}
.publish-title {
  font-size: 31px;
  line-height: 1.5;
  font-weight: 800;
  margin: 12px 0 22px;
}
.section-card {
  padding: 18px;
  border-radius: 14px;
  background: #eff2e6;
  margin: 18px 0;
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #34553f;
  margin-bottom: 12px;
}
.form-help {
  display: block;
  font-size: 11px;
  color: #7b8e6c;
  line-height: 1.9;
  margin: 12px 0;
}
.choice-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 12px;
  color: #466743;
  min-height: 46px;
  text-align: left;
}
.consent-choice {
  display: block;
  width: 100%;
  font-size: 11px;
  text-align: left;
  line-height: 1.9;
  color: #53724b;
  padding: 15px 0;
}
.field-label {
  display: block;
  font-size: 12px;
  margin: 18px 0 10px;
  color: #4e6b45;
}
.price-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-bottom: 10px;
}
.price-option {
  border: 1px solid #d7dfc8;
  border-radius: 9px;
  padding: 12px 3px;
  font-size: 16px;
  color: #59794a;
}
.price-option.selected {
  border-color: #698b50;
  background: #e0eacb;
  color: #304f38;
}
.field-input {
  display: block;
  width: 100%;
  background: #f9faf4;
  border: 1px solid #dbe3ce;
  border-radius: 8px;
  min-height: 45px;
  padding: 11px 12px;
  font-size: 12px;
  margin: 10px 0;
  color: #405c3f;
}
.pack-textarea {
  width: 100%;
  height: 190px;
  background: #fafbf5;
  border: 1px solid #dce3d0;
  border-radius: 9px;
  padding: 12px;
  box-sizing: border-box;
  font-size: 12px;
  line-height: 1.9;
  margin: 13px 0;
}
.section-card .secondary {
  margin-top: 12px;
  font-size: 11px;
}
</style>
