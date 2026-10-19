# API 契约

除健康检查与配置、创建会话外，接口都需要 `Authorization: Bearer <token>`。响应均禁止缓存，不提供公开报告查询。

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
- `done`：附带 `report`，包含 mode、industry、round、preferences、score、coverage、verdict、dimensions、investors、missingInvestors、actions、disclaimer。缺席名单来自本次所选教练组合。
- `failed`：附带安全的 `error.code` 与 `error.message`，不转发服务商原始响应。

报告不包含完整项目正文或原始文件。原文摘录会存在于单项依据中。

## DELETE /api/evaluations/:id

取消自己的运行任务并终止上游请求，或删除自己的报告缓存。返回 204。删除其他用户任务不会产生影响，且不暴露任务是否存在。

## 错误结构

```json
{ "error": { "code": "AI_TIMEOUT", "message": "AI 投资人暂未完成审阅，请稍后重试" } }
```

常见状态：400 字段 / 同意错误，401 会话失效，404 报告不存在，409 同一用户已有任务，413 资料过大，415 格式不支持，422 解析失败，429 限流 / 配额 / 繁忙，502 模型结果异常，503 未配置模型，504 模型超时。
