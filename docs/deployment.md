# 部署 API 与微信小程序

## 单进程 API

Node.js 22.13+，在仓库根目录安装并构建：

```sh
pnpm install --frozen-lockfile
pnpm build:api
```

把 `.env.example` 复制为根目录的 `.env`，填写以下生产配置：

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=实际服务端密钥
AI_MODEL=实际可用模型ID
SESSION_SECRET=至少32个随机字符
WECHAT_APP_ID=实际微信AppID
WECHAT_APP_SECRET=实际微信AppSecret
CORS_ORIGINS=https://你允许的H5域名
```

运行 `pnpm --filter @pitchcoach/api start`，在网关配置 HTTPS 和文件上传体积上限（应容纳 10 MB 文件及 multipart 额外字段）。生产配置缺少微信凭据或强会话密钥时启动会失败。`SESSION_SECRET` 变更会使已签发的会话失效。

API 默认不信任客户端转发头，避免伪造 IP 绕过限流。使用本机反向代理时，可配置 `HOST=127.0.0.1` 与 `TRUST_PROXY_LOOPBACK=true`，仅信任来自 `127.0.0.1` 的转发头；代理必须覆盖用户传入的 `X-Forwarded-For`，写入实际客户端 IP。否则代理后的 IP 限流可能把多个用户合并。不要将该选项用于未经核验的代理配置。

当前独立服务器部署的目录、资源限制、凭据填写、验收与回滚步骤见 [deploy/README.md](../deploy/README.md)。

## 资源与费用

每次评估会对三个角色各调用一次模型。默认不做自动模型重试，避免移动端重复请求导致不可见费用。API 使用异步任务和轮询；客户端收到结果后请求删除后台缓存。退出评估可取消未完成的上游请求，但服务商已执行部分仍可能计费。

- `MAX_ACTIVE_EVALUATIONS`：默认 2，限制同时进行的项目评估。
- `DAILY_EVALUATIONS_PER_USER`：默认 5，按用户滚动 24 小时；内存记录有容量上限。
- `AI_TIMEOUT_MS`：默认每位投资人 60 秒。
- `AI_MAX_OUTPUT_TOKENS`：默认 16,000，范围 512–32,768，由服务端限制每位教练的输出预算，包含思考模型的推理与最终 JSON。原先 6,000 的固定预算可能在正文生成前被推理耗尽。使用 DeepSeek Pro 高强度思考时建议 `AI_TIMEOUT_MS=240000`（上限 300,000），并用虚构资料验证三位教练均能交付；提高预算和等待时间可能增加费用与延迟，不自动重试。
- `AI_JSON_MODE`：默认 true；不支持 JSON mode 的服务商可设 false，但结果仍必须通过 JSON 结构校验。
- 文件解析最多同时两份，每个实例的 JavaScript 老生代堆上限 256 MB，超时 12 秒；文件上限 10 MB。Windows PDF 使用独立进程隔离原生库，其余使用工作线程。
- Office 解压文字累计最多 32 MB，最多 1,500 个压缩条目，不读取宏、不执行脚本、不拉取外部资源。

免费开发模式的任务与配额仍为单进程内存状态。启用 `PAYMENTS_ENABLED=true` 后，每次真实评审固定收取 188 分，支付与额度账本持久保存在独立 SQLite，已完成报告加密缓存，未完成任务在重启后恢复额度。付费模式不使用免费每日次数限制。配置、人工退款与数据保留说明见 [微信支付接入](payments.md)。仍只支持单实例，扩容前需要重新设计任务协调和账本恢复。

## 微信配置

1. 在后台填写与前端一致的微信 AppID / AppSecret。
2. 前端 `manifest.json` 的 `mp-weixin.appid` 填写实际 AppID。
3. 在 `apps/miniprogram/.env.local` 配置 `VITE_API_BASE_URL` 为实际 HTTPS 后台地址。
4. 执行 `pnpm build:weixin`，导入 `apps/miniprogram/dist/build/mp-weixin`。
5. 在微信公众平台设置 `request` / `uploadFile` 合法域名，并填写符合实际服务商与部署方式的隐私说明。
6. 用真机检查微信登录、聊天文件选择、完整评估、后台切换、海报保存及相册权限拒绝后的提示。

页面内已提供“隐私与使用说明”、可撤回的 DeepSeek 资料处理同意，以及真实结果和分享图片的 AI 标识。运营主体、联系邮箱与后台隐私声明必须匹配实际部署。发布前按[微信隐私配置与上线核对](wechat-privacy.md)完成公众平台配置和真机验收；代码不替代这些后台操作。

默认 `urlCheck: true`。没有配置后台时，固定演示在小程序内仍可使用。真实模型评估、上传与微信生产登录需要部署配置，不会借用维护者密钥。

## 数据生命周期

文件和正文仅在解析、评估的内存中使用，不写入应用数据库。模型服务商会收到项目文字，其保存策略由服务商条款决定。部署者必须向用户明确实际服务商、资料用途与保存规则。

完成报告只在后台缓存最多 10 分钟，客户端领取后发送 DELETE 请求；网络异常可能导致缓存保留到过期。完整报告保存到当前设备，包含投资人发言、原文摘录等商业信息。当前设备最多保存 20 份，清理缓存或卸载可能丢失。分享海报由本机生成，默认匿名，用户预览后自行公开。

生产环境不记录请求正文、认证头、文件正文或供应商完整错误。请勿在外层网关、APM 或自定义日志中重新开启这些内容记录。

## 参考

- [uni-app CLI 与微信构建](https://uniapp.dcloud.net.cn/quickstart-cli.html)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/)
- [微信登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)
