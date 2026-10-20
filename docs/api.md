# API 契约

除健康检查、配置、创建会话和已验签的微信支付回调外，接口都需要 `Authorization: Bearer <token>`。响应均禁止缓存；项目方单独确认公开后，可通过公开项目接口查看完整评估。公开浏览与账号配置查询不要求用户会话。

## GET /health

返回 `{ "ok": true }`，只表示进程存活。

## GET /api/config

返回 `liveAvailable`、`requireWechat`、`maxFileBytes`、`paymentsEnabled`、`reviewPriceFen`（188），不返回密钥和服务商账号。

付款前可传入 `industry`、`round`、`preferences`（三种不同偏好，以逗号分隔）查询本场阵容。
例如 `/api/config?industry=ai&round=angel&preferences=technology,growth,financial`。
此时 `liveAvailable` 表示这三位教练均已配置，而非其他行业存在可用阵容。
无查询参数时仍返回全局可用状态。非法行业、轮次或偏好组合返回 400。

## POST /api/session

请求 `{ "code": "wx.login 返回的 code" }`。生产环境在服务端调用微信 `jscode2session`，使用 openid 的 HMAC 摘要作为用户标识，返回两小时有效的签名 token。openid、session_key 和微信密钥不会返回给客户端。

开发环境未配置微信凭据时允许临时匿名会话，该能力在生产配置中禁用。

## POST /api/documents/extract

multipart 字段 `file` 和 `consent=true`。支持 `.pdf`、`.pptx`、`.docx`、`.txt`、`.md`，最大 10 MB；返回 `{ "text": "提取正文", "truncated": false }`。超出 50,000 字时截断并将 `truncated` 设为 true，由用户在提交前检查文字。

无足够可提取文字、格式不合法、超限或解析超时都返回明确错误；不提供隐式 OCR。

## POST /api/evaluations

启用支付时，必须携带 `Idempotency-Key`（12–80 位字母、数字、下划线或连字符）；同一用户重试同一键不会重复扣额度。无额度返回 402 `PAYMENT_REQUIRED`。

请求示例：

```json
{
  "projectName": "拾光 AI",
  "industry": "ai",
  "round": "angel",
  "preferences": ["technology", "growth", "financial"],
  "stage": "已有收入",
  "description": "为内容团队提供视频粗剪工具，已有早期付费客户，希望验证留存和单位经济后扩大销售。",
  "bpText": "可选的更完整项目正文",
  "tone": "sharp",
  "consent": true
}
```

`industry`：ai / saas / consumer / hardware / health / climate / fintech / other。

`round`：seed / angel / pre-a / a / b / growth；默认 angel。

`preferences`：恰好三项且不得重复，可选 technology / growth / financial / product / team / strategy。省略时默认 `["technology", "growth", "financial"]`，兼容旧客户端。服务端从当前行业与轮次的六位专项教练中解析名单，客户端不能指定任意角色 ID、提示词或增加调用数量。

`stage`：想法阶段 / 已有原型 / 已有用户 / 已有收入 / 规模增长。

`tone`：sharp / balanced。项目介绍 30–3,000 字，BP 正文最多 50,000 字。

返回 HTTP 202：

```json
{ "id": "任务UUID", "status": "running", "completedInvestors": 0, "totalInvestors": 3 }
```

无模型密钥返回 503 `AI_NOT_CONFIGURED`，不会给真实用户输入生成固定演示。客户端无法指定任意服务商地址、模型或提示词。

## GET /api/evaluations/:id

只有任务所属会话用户能访问，其他用户与不存在 / 过期任务均返回 404。

- `running`：返回实际完成评审的数量。
- `done`：附带 `report`，包含 mode、industry、round、preferences、score、coverage、verdict、diagnostics、decisionReasons、dimensions、investors、missingInvestors、actions、disclaimer。缺席名单来自本次所选教练组合。
- `failed`：附带安全的 `error.code` 与 `error.message`，不转发服务商原始响应。

报告不包含完整项目正文或原始文件。原文摘录会存在于单项依据中。

新模型响应必须包含 `diagnostics` 的四个数组，允许为空，但不能省略整个专项检查：

- `redFlags`：topic、title、detail、basis=`explicit_statement`、逐字 evidence、question、remedy。引用匹配失败则降为待核验橙旗，且不保留无依据指控；匹配成功仍不等于已独立核实。
- `orangeFlags`：topic、title、detail、evidence（无相关原文时为空）、missing、question、remedy。
- `assumptions`：topic、statement、basis=`stated/inferred`、evidence、whyCritical、test、passCriterion。无法匹配的 stated 引用改标为 inferred。
- `failureModes`：mechanism、basedOn（关联本次风险 topic）、condition（以“若/如果”开头）、chain、earlySignal、prevention。不关联本次有效诊断的失败推演被移除。

报告聚合诊断为每项增加 `investorIds`，并带 `reviewedInvestors` 和 `gate=blocked/clarify/validate/clear`。`gate` 是诊断状态，不能替代同时显示的证据覆盖、缺席评审与最终结论。任一有效红旗强制 `verdict=pass`，显示“红旗阻断”；关键橙旗或假设阻止 `invest`，但不覆盖已有的资料不足或暂不投资结论。`decisionReasons` 说明四类问题如何影响结论。报告仍为 `version=1`；兼容旧本机历史时缺失 `diagnostics` 表示“未检查”，不表示空数组。

公开海报仅提取诊断数量、受控类别名称与预设的条件性失败文案，不传出详细诊断、原文摘录、投资人追问或报告 ID。完整私密诊断只保留在报告内。

## DELETE /api/evaluations/:id

取消自己的运行任务并终止上游请求，或删除自己的报告缓存。返回 204。删除其他用户任务不会产生影响，且不暴露任务是否存在。

## 错误结构

```json
{ "error": { "code": "AI_TIMEOUT", "message": "AI 投资人暂未完成审阅，请稍后重试" } }
```

常见状态：400 字段 / 同意错误，401 会话失效，404 报告不存在，409 同一用户已有任务，413 资料过大，415 格式不支持，422 解析失败，429 限流 / 配额 / 繁忙，502 模型结果异常，503 未配置模型，504 模型超时。

## 支付接口

- `GET /api/billing/status`：当前用户的可用额度、最近 20 单状态、客服联系方式和可继续/领取的任务 ID。
- `POST /api/billing/orders`：空对象请求；只由服务端生成 188 分 / CNY 的订单，返回 `orderId` 和微信收银台签名参数。客户端金额字段会被拒绝。已有额度时返回 409 `CREDIT_AVAILABLE`，避免重复付款。
- `GET /api/billing/orders/:id`：仅查询自己的订单；必要时向微信查单，再返回订单状态与当前额度。跨用户返回 404。
- `POST /api/payments/wechat/notify`：微信支付回调，不使用用户会话。按原始 JSON 报文验签解密并核对商户、AppID、付款人、金额等信息后才入账，成功返回 204；失败返回非 2xx，由微信重试。重复回调不重复授予额度。

`DELETE /api/evaluations/:id` 在报告完成前取消会恢复额度；完成后只清除报告缓存，不退还已消费额度。部分成功的报告计一次。启用支付时报告通过加密短期缓存支持重启后继续领取；全失败或意外中断的任务恢复额度。更多配置与人工退款流程见 [payments.md](payments.md)。

## 公开项目、礼物与云端账户

分享与虚拟支付参见 [接口与配置](project-sharing.md)，微信身份和 `/api/me` 系列参见 [账户与云端](accounts-and-cloud.md)。`POST /api/projects` 只接受本人签发报告与独立披露同意，项目方可设置价格及礼物入口。`GET /api/projects/:id` 免费公开授权评估，`code.png?format=mini|web` 获取实际扫码入口。`POST /api/projects/:id/orders` 使用 `kind=unlock|gift`；礼物必须提供有效 `giftId` 且金额匹配服务端目录。已核实后才发放资料或确认礼物，名称随订单快照保留。

`/api/commerce/mine`、项目 `owner/settings/access` 和 `/api/orders/:id[/material]` 只对相应身份开放。资料访问与礼物的 XML 安全模式通知使用 `/api/payments/virtual/notify`；评估支付原有 JSON 通知继续使用 `/api/payments/wechat/notify`。两类支付配置独立，不共用通知协议。

`GET /api/projects/:id/owner` 返回最近 50 笔订单，并附带收入汇总（汇总覆盖全部订单）。如果还有更早的订单，响应会带上 `nextCursor`，用 `GET /api/projects/:id/owner/orders?cursor=<nextCursor>` 继续翻页，直到响应中不再出现 `nextCursor`。游标对客户端不透明，篡改后返回 400。

公开页浏览数对同一访客的同一项目每 24 小时只计一次。去重只在内存中进行，使用访客地址的带密钥哈希，不保存原始 IP。引荐数对每个发起评估的用户只计一次，项目方本人和已停止公开的项目不计数。
