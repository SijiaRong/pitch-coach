# API 契约

健康检查、公开配置、创建会话、项目方授权的公开项目及二维码不需要会话；其余业务接口需要 `Authorization: Bearer <token>`。响应均禁止缓存。完整评估仅在项目方确认公开后提供，原评估任务仍只对所属用户可见。

## GET /health

返回 `{ "ok": true }`，只表示进程存活。

## GET /api/config

返回 `liveAvailable`、`requireWechat`、`maxFileBytes`，不返回密钥和服务商账号。

## POST /api/session

请求 `{ "code": "wx.login 返回的 code" }`。生产环境在服务端调用微信 `jscode2session`，使用 openid 的 HMAC 摘要作为用户标识，返回两小时有效的签名 token。openid、session_key 和微信密钥不会返回给客户端。

开发环境未配置微信凭据时允许临时匿名会话，该能力在生产配置中禁用。

## POST /api/documents/extract

multipart 字段 `file` 和 `consent=true`。支持 `.pdf`、`.pptx`、`.docx`、`.txt`、`.md`，最大 10 MB；返回 `{ "text": "提取正文", "truncated": false }`。超出 50,000 字时截断并将 `truncated` 设为 true，由用户在提交前检查文字。

无足够可提取文字、格式不合法、超限或解析超时都返回明确错误；不提供隐式 OCR。

## POST /api/evaluations

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

海报画面仅提取诊断数量、受控类别名称与预设的条件性失败文案，不绘制详细诊断、原文摘录、投资人追问或本机报告 ID。用户另行确认公开完整评估后，海报增加指向该公开评估的小程序码；免费公开评估包含全部诊断与引用，不等于正文自动脱敏。

## 公开项目与交易

`GET /api/commerce/config` 返回分享、支付、小程序码、网页码的可用性及 `serviceFeeRateBps=500`，不返回任何密钥。

`POST /api/projects`：需要本人有效的真实报告 `publicationProof`，以及 `publicReportConsent=true`。可选 `anonymous`、`unlockEnabled`、`unlockPriceFen`、`privatePack={overview,contactName,contactChannel,contactValue}`、`privateDisclosureConsent`、`tipsEnabled`、`serviceFeeConsent`。开启解锁必须有完整资料与私密披露确认；开启任一收款入口必须确认 5% 服务费。返回 201 与随机公开 ID，不在公开 DTO 中包含资料包、身份或发布凭证。

- `GET /api/projects/:id`：免费完整评估，只有已公开项目有效。
- `GET /api/projects/:id/code.png?format=mini|web`：官方小程序码或指向配置域名的网页二维码，未配置返回明确错误。
- `GET /api/demo/code.png?scene=d~...&format=mini|web`：仅虚构白名单场景可用，不接受任意目标 URL 或真实私密信息。
- `GET /api/projects/:id/owner`：仅项目方，含订单、经过付款核实且主动授权的联系线索、标价流水、实收、退款、5% 服务费、项目方份额、渠道费及待对账数量。结算状态固定 `pending_external`。
- `POST /api/projects/:id/settings`：仅项目方，传 `expectedRevision`、`unlockPriceFen`、`tipsEnabled`；尚未确认服务费时还需 `serviceFeeConsent=true`。更新价格递增版本。
- `DELETE /api/projects/:id`：仅项目方停止新分享/购买，返回 204；不删除购买凭据与已经购买的资料快照。
- `GET /api/projects/:id/access`：当前微信用户可访问范围；资料包仅项目方或已经核实付款的购买者可见。
- `GET /api/commerce/mine`：本人公开项目与购买记录。

`POST /api/projects/:id/orders`：传 `kind=unlock|tip`、整数分 `amountFen`、`expectedRevision`、本人声明的 `role`、UUID `idempotencyKey`、`purchaseConsent=true`。联系方式 `contact`、留言 `message` 可选，提供联系方式须 `shareContactConsent=true`。解锁仅投资人声明可发起，打赏仅四档，不允许购买自己的项目。后台绑定微信身份、准确金额、已发布商品和不可变资料快照。同一幂等键同一请求返回同一订单，不同请求返回 409。

返回订单和客户端 `wx.requestVirtualPayment` 参数。`GET /api/orders/:id` 仅购买者可核对；`GET /api/orders/:id/material` 核对微信付款后才返回其购买时的资料包。不能通过前端 `paid=true`、换价、换用户或复用订单获取资料。自定义价位未匹配已发布商品时返回 `PRICE_NOT_ENABLED`。

`GET/POST /api/payments/wechat/notify` 在真实支付启用时注册，用于微信 URL 校验与 XML 安全模式通知；校验签名、AES 解密与接收 AppID，成功退款撤销该笔权限。后台定期查单补偿，客户端回调不是到账依据。退款/分账计算和真实联调边界详见[分享与支付说明](project-sharing.md)。

`POST /api/evaluations` 可选带公开 `referralProjectId`，被接收后计入来源项目的“发起评估”次数；不改变评分，也不保证完成评估。真实报告额外携带只供本人发布的签名凭证，不应作为公开内容展示。

## DELETE /api/evaluations/:id

取消自己的运行任务并终止上游请求，或删除自己的报告缓存。返回 204。删除其他用户任务不会产生影响，且不暴露任务是否存在。

## 错误结构

```json
{ "error": { "code": "AI_TIMEOUT", "message": "AI 投资人暂未完成审阅，请稍后重试" } }
```

常见状态：400 字段 / 同意错误，401 会话失效，404 报告不存在，409 同一用户已有任务，413 资料过大，415 格式不支持，422 解析失败，429 限流 / 配额 / 繁忙，502 模型结果异常，503 未配置模型，504 模型超时。
