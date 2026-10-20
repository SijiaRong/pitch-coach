# 微信代码预览与上传

本地上传密钥保存在仓库外：
`~/.config/pitch-coach/wechat/private.<AppID>.key`。
目录权限设为 700，私钥权限设为 600。不要将私钥提交到 Git。
在其他机器或 CI 中使用时，通过安全文件注入密钥，并以
`WECHAT_CI_PRIVATE_KEY_PATH` 指定绝对路径。

使用项目要求的 Node.js 22.13+ 与 pnpm 11.25.0。

```sh
pnpm wechat:check
pnpm wechat:preview --desc '真机预览验证'
pnpm wechat:upload --version 0.1.0 --desc '版本说明'
```

脚本读取 `apps/miniprogram/src/manifest.json` 的 `mp-weixin.appid`，
检查私钥权限和文件名中的 AppID。预览和上传均先重新构建，再校验产物 AppID。
默认 CI 机器人编号为 1，可通过 `--robot 2` 或 `WECHAT_CI_ROBOT` 修改。

预览码默认写到 `.artifacts/wechat/preview.jpg`，该目录被 Git 忽略。
可通过 `--output /absolute/path/preview.jpg` 修改输出位置。
上传仅生成微信后台的开发版本，不自动提审或发布，也不部署 API 服务器。

## 上传 IP 白名单

在微信公众平台「开发设置 → 小程序代码上传 → IP 白名单」中，
添加实际运行脚本的机器的公网出口 IPv4。更换网络、代理或 CI 执行机器后，
应重新核实出口地址。微信返回 IP 白名单错误时，以错误中的实际来源 IP 为准。
上传白名单与 API 服务器的 IP 白名单是两个不同配置。

## 真机环境

构建前在 `apps/miniprogram/.env.local` 配置正式 HTTPS API 地址
`VITE_API_BASE_URL`，并在微信后台设置对应的 request/uploadFile 合法域名。
未配置时只能验证内置演示；预览码生成成功不表示真实模型评估和支付已可用。
