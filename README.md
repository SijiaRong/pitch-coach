<div align="center">

# PitchCoach · 融资教练

**先被 AI 问倒，再去见投资人。**

一个把创业者的自我感动，变成可验证假设的开源微信小程序。

[![CI](https://github.com/SijiaRong/pitch-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/SijiaRong/pitch-coach/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-d9f18a.svg)](LICENSE)
![WeChat Mini Program](https://img.shields.io/badge/微信小程序-uni--app-2f684e)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)

8 个行业 × 6 个融资轮次 · 15 位虚构 AI 投资人 · 八维评估 · 朋友圈海报

</div>

> “你的梦想很贵，先让我看看账本。”
>
> —— 何算，财务理性派，**虚构 AI 投资人**

## 它做什么

填项目名称、赛道、目标融资轮次、产品阶段和一段简要介绍，按需上传 BP。行业主审、轮次教练和财务派分别审阅，给出有依据的评分、模拟投资结论、追问与优先改进清单。金句和评分可在本机生成海报，预览后自行分享。

- **简洁输入**：一句话介绍是核心，BP 为可选补充；支持 PDF、PPTX、DOCX、TXT、Markdown 的文字提取。
- **行业 × 轮次匹配**：8 个行业与 6 个融资轮次组合，不同主审、教练、提问标准和维度权重。
- **独立三人评审**：3 次并行模型调用，可按角色分别配置服务商与模型。
- **八维拆解**：痛点强度、市场空间、产品价值、竞争壁垒、增长验证、商业模式、团队适配、融资逻辑。
- **两种语气**：犀利版直戳商业逻辑；专业版冷静、建设性。点评针对项目，不羞辱个人。
- **有证据才评分**：模型必须引用原文，无法匹配的引用被剔除；缺资料标记“待补”，不强行给零分。
- **明确的下一步**：最多四项按优先级排序的改进任务，可一键复制。
- **可控分享**：海报默认匿名；小程序分享入口只打开首页，不携带 BP 或完整报告。
- **本机历史**：最多保留 20 份报告；不需要给 BP 建一个公开数据库。
- **离线演示**：无需 Key 即可查看各行业和轮次的虚构示例，固定评分有明显标识；真实调用失败不会伪装成 AI 结果。

## 哪个行业，谁来主审

人工智能找沈砚，企业服务找江澄，消费品牌找许知微，硬件科技找陈铸，医疗健康找林知远，新能源与气候找方循，金融科技找陆衡，其他创新找闻舟。每位主审关注不同的行业证据。

融资轮次独立于产品阶段：

- **种子轮 · 许问**：问题是否真实，团队为什么适合，最小实验怎么做。
- **天使轮 · 顾初**：早期反馈、产品迭代、付费意愿与验证里程碑。
- **Pre-A · 周见**：留存、初步单位经济、渠道和产品市场匹配信号。
- **A 轮 · 程拓**：增长能否复制，销售交付与组织能否承接规模。
- **B 轮 · 顾稳**：规模下的效率、现金流、利润路径与竞争韧性。
- **C 轮及以后 · 唐策**：盈利质量、治理、资本配置与可论证的退出路径。

何算负责所有轮次的财务交叉审阅。**这些角色全部虚构，不是任何真实人物或机构的代言。**

## 本地运行

需要 Node.js **22.13+** 与 pnpm **11.25.0**。在 Node.js 24.19.0 上完成本地验证，CI 使用 Node.js 22。

```sh
git clone https://github.com/SijiaRong/pitch-coach.git
cd pitch-coach
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开 [本地预览](http://localhost:5173)，API 运行在 `127.0.0.1:8787`。没有模型 Key 时也能完整体验演示报告、行业轮次匹配、历史记录与海报。H5 是同一套小程序源码的开发预览，不是微信发布链接。

### 接入真实 AI

把根目录 `.env.example` 复制为 `.env`，只在后台设置：

```dotenv
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=你的服务端密钥
AI_MODEL=deepseek-flash
```

重启 API，勾选资料处理说明后即可评估真实项目。采用 Chat Completions 兼容接口，可更换支持该协议的模型服务。`AI_BASE_URL` 应是 API 根地址，需要时包含 `/v1`，不要包含 `/chat/completions`。

默认使用 JSON mode 与严格的服务端结果校验。若服务商不支持 `response_format`，设置 `AI_JSON_MODE=false`；结果仍必须是符合结构的 JSON。模型 ID 以服务商当前可用的 ID 为准。

不同角色可覆盖 `BASE_URL`、`API_KEY`、`MODEL`，角色 ID 中的 `-` 改成 `_` 并转大写。例如：

```dotenv
AI_AI_PARTNER_MODEL=你的行业主审模型
AI_ANGEL_COACH_MODEL=你的天使轮教练模型
AI_GROWTH_PARTNER_MODEL=你的Pre-A教练模型
AI_FINANCE_PARTNER_BASE_URL=https://你的模型服务/v1
AI_FINANCE_PARTNER_API_KEY=另一个服务端密钥
AI_FINANCE_PARTNER_MODEL=你的财务模型
```

角色与轮次定义见 [catalog.ts](packages/shared/src/catalog.ts)，完整配置见 [.env.example](.env.example)。**密钥不要放进前端、仓库或微信小程序包。**

### 编译微信小程序

只想在模拟器中体验 Demo，可以先不配置 AppID 或后台：

1. 安装并登录[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 运行 `pnpm build:weixin`，在开发者工具中导入 `apps/miniprogram/dist/build/mp-weixin`。
3. 在导入页选择“测试号”，后端服务选择“不使用云服务”；出现项目作者信任提示时，确认来源后运行。
4. 等待首次编译完成，点击首页“示例报告”，或进入“项目评估”选择行业与融资轮次后查看对应示例。演示完全在本地生成，不需要 API Key。

部分新版工具不接受默认的 `touristappid`，请使用导入页提供的“测试号”入口。开发者工具会把所选测试 AppID 写入本机的 `dist` 配置，该目录已被 Git 忽略。重新构建后，可能需要再次选择测试号。测试号用于开发体验，不能代替正式发布所需的小程序账号。

连接真实后台或准备发布时：

1. 在 `apps/miniprogram/src/manifest.json` 的 `mp-weixin.appid` 填入自己的小程序 AppID。
2. 把 `apps/miniprogram/.env.example` 复制为该目录下的 `.env.local`，配置 `VITE_API_BASE_URL=https://你的后台域名`。此变量是公开的 API 地址，不是密钥。
3. 运行 `pnpm build:weixin`。
4. 在微信开发者工具中导入 `apps/miniprogram/dist/build/mp-weixin`。
5. 在微信公众平台配置后台域名为合法的 `request` 与 `uploadFile` 域名。

微信实际发布需要你的小程序账号、AppID、后台 HTTPS 服务以及平台审核。仓库不附带任何账号凭据。开发时可用 `pnpm dev:weixin` 生成带监听的 `dist/dev/mp-weixin`。

## 评分规则

行业基础权重乘以融资轮次的关注系数，归一化为合计 100 的整数权重。不同轮次是不同的评审标准，不是给后期项目加分。

```text
单项得分 = 完成评审且具有原文证据的投资人评分均值
参考总分 = Σ(已评分维度得分 × 组合权重) / Σ(已评分维度权重)
证据覆盖 = Σ(已评分维度权重)
```

总分是自检参考，不是成功概率或估值。原文匹配只能排除一部分捏造引用，不能验证用户陈述是否真实，也不能消除模型在推理和建议中的错误。

- 覆盖不足 60%、只有一位评审完成，或至少两位评审认为资料不足：**资料不足**。
- 三位全部完成、至少两位愿意推进、覆盖至少 80%：**愿意推进**，仅表示模拟中愿意进一步尽调。
- 至少两位不投：**暂不投资**。
- 其他情况：**继续观察**。

部分模型失败时展示缺席角色并保守处理；全部失败时返回明确错误。算法与边界测试见 [scoring.test.ts](packages/shared/src/scoring.test.ts)。

## 技术与数据流

```text
uni-app / Vue 3 / TypeScript
  ├─ 微信小程序 / H5 开发预览
  ├─ 输入 → 行业 × 轮次匹配 → 资料处理同意
  ├─ BP 文件 → 受限工作线程提取文字 → 用户可检查正文
  └─ 提交文字 → Fastify API → 三位投资人并行审阅
                            → JSON 校验 / 原文证据核验 / 加权汇总
                            → 本机报告 / 改进清单 / Canvas 海报
```

```text
apps/miniprogram/        小程序与 H5 预览，共用页面和交互
apps/api/                会话、上传解析、模型适配与异步任务
packages/shared/         行业、轮次、角色、结构、评分与虚构示例
docs/deployment.md       生产部署、环境配置与运行边界
docs/api.md              API 契约与错误处理
```

原始 BP 与正文不写入应用数据库。文件解析在限制时长与内存的工作线程中完成；上传最大 10 MB，PDF/PPTX 最多 80 页，提取正文最多 50,000 字。扫描件 / 图片 BP 暂不支持 OCR。后台任务及报告仅在内存中保留最多 10 分钟，客户端领取后请求删除。进程重启会丢失未领取的任务。

生产环境使用微信登录换取签名会话。默认最多两份评估同时运行，每位用户每滚动 24 小时五次；失败的完整评估返还次数。配额与任务目前为单进程内存实现，公开多实例部署前应接入共享配额存储。更完整说明见 [部署文档](docs/deployment.md)。

## 开发与验证

```sh
pnpm typecheck       # 共享结构、API、Vue 页面类型
pnpm test            # 评分、原文校验、轮次匹配、会话隔离、文件与模型错误边界
pnpm build:api       # 后台生产构建
pnpm build:h5        # 浏览器预览生产构建
pnpm build:weixin    # 微信小程序生产构建
pnpm check           # 上述完整检查
```

自动测试使用本地替身模型与虚构数据，不消耗 AI 额度。真实模型效果、微信真机分享 / 相册权限仍需部署者用自己的账号验证。

欢迎贡献新的行业评分规则、轮次方法论、模型适配与真实使用反馈。请在 Issue 和 PR 中使用脱敏或虚构资料，见 [贡献说明](CONTRIBUTING.md)。

## License

[MIT](LICENSE) © 2026 Sijia Rong
