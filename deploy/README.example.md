# 部署模板

这些文件是通用示例，不包含生产账号、密钥、服务器地址或现有服务的部署状态。部署前根据自己的主机和域名调整路径与配置。

1. 按 [部署文档](../docs/deployment.md) 构建 API，安装 Node.js 22.13+，创建专用服务用户。
2. 将发布文件放入 `/opt/pitch-coach/releases/<版本>/`，以 `/opt/pitch-coach/current` 指向当前版本；环境文件放在 `/etc/pitch-coach/api.env`，只允许受控服务读取。
3. 调整 `pitchcoach-api.service` 中的运行时、程序和环境文件路径。`check-config.mjs` 用于检查必需配置，`activate-api.sh` 用于只激活本应用。
4. 将 `Caddyfile` 中的 `api.example.com` 改为自己的域名，检查现有端口与网关配置，再使用 `pitchcoach-https.service`。
5. 启用收费前完成 [微信支付配置](../docs/payments.md)。支付账本及维护任务说明见 [payment-storage.md](../docs/payment-storage.md)。

密钥、真实环境文件、账本、备份、预览码和具体生产运维记录均不应提交到 Git。实际部署笔记可保存在本机被忽略的 `deploy/README.md` 或仓库外。

代码绘制的头像可在 macOS 上用 `swift scripts/render-avatar.swift` 重新生成；默认输出至被忽略的 `output/avatar/`，确认后再更新小程序的静态品牌图片。
