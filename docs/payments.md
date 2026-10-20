# 微信支付：一次评审 ¥1.88

当前接入普通商户的小程序支付 APIv3（JSAPI 下单），使用微信支付公钥验签，不使用 APIv2。
部署时必须显式开启 `PAYMENTS_ENABLED=true`；关闭只用于本地开发或经运营者明确决定的免费环境。
正式收费环境不要将缺少商户配置当作关闭支付、免费放行的理由。

## 计费与交付

- 每单固定 188 分 / CNY；客户端不能指定或修改价格。
- 演示报告免费。支付成功获得一次真实评审额度，不是前端回调一成功就直接调用模型。
- 商户 API 成功应答和回调均验签。回调按原始报文验证，再用 APIv3 密钥 AES-256-GCM 解密。
- 同时校验 AppID、商户号、交易状态、JSAPI 类型、付款人 OpenID、188 分金额与币种。
- 商户订单号、微信交易号、额度和请求幂等键持久保存在 SQLite；重复回调和提交不会重复加额度或重复消费。
- 评审开始时预留额度，完成至少一位教练的报告后扣除；全部失败或报告完成前取消会恢复额度。
- 进程正常退出会恢复未完成额度；意外中断后，下次启动从账本恢复。已完成的报告在原缓存有效期内可再次领取。
- 微信支付前端回调不作为支付凭据；客户端会查询后端，后端必要时向微信主动查单，避免仅依赖通知。
- 付费评审不受开发免费模式的每日五次限额约束，仍受全局并发和接口限流保护。
- 不自动发起真实退款；未使用额度由运营者在微信支付商户平台核实后原路退款。

## 商户后台需要人工完成

1. 确认小程序账号认证状态、实际服务类目，以及商户已开通 JSAPI/小程序支付权限。
2. 确认该商户号与 你的小程序 AppID 的授权绑定已完成，而不只是发起申请。
3. 在商户平台“账户中心 → API 安全”确认可用的商户 API 证书序列号、对应私钥、APIv3 密钥，以及微信支付公钥和公钥 ID。
4. 复用现有有效凭据。若其他生产服务共用同一商户，勿擅自重置 APIv3 密钥、替换现有证书或切换验签模式；先确认它们的兼容性。
5. 按微信后台对实际交易类目提出的要求，确认交易保障、订单管理和发货管理接入要求；本次实现没有假装已经完成平台侧的发货管理接入。
6. 上传体验版后在真机完成一次 1.88 元支付，核对商户收款、订单金额、评审额度、结果领取和人工退款流程。测试也可能产生真实扣款；本项目没有伪造支付成功的测试开关。

## 服务器配置

修改 root 专用文件 `/etc/pitch-coach/api.env`：

```dotenv
PAYMENTS_ENABLED=true
PAYMENT_DB_PATH=/var/lib/pitchcoach-api/payments.sqlite
WECHAT_PAY_MCH_ID=实际商户号
WECHAT_PAY_SERIAL_NO=实际商户API证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=/etc/pitch-coach/secrets/apiclient_key.pem
WECHAT_PAY_PUBLIC_KEY_ID=实际PUB_KEY_ID开头的微信支付公钥ID
WECHAT_PAY_PUBLIC_KEY_PATH=/etc/pitch-coach/secrets/wechatpay_public.pem
WECHAT_PAY_API_V3_KEY=实际32字节APIv3密钥
WECHAT_PAY_NOTIFY_URL=https://api.example.com/api/payments/wechat/notify
PAY_SUPPORT_CONTACT=实际展示给用户的邮箱或微信号
```

只有公开的通知 URL、数据库路径和密钥文件路径能预填，其余值以真实商户后台为准。不要在聊天、前端、Git 或命令行参数中放密钥。
商户 API 私钥与微信支付公钥不是同一份文件；小程序 AppSecret 也不能当作 APIv3 密钥。

通过 SSH/SCP 安全上传证书文件，再在服务器执行（替换输入文件位置）：

```sh
install -d -o root -g pitchcoach -m 0750 /etc/pitch-coach/secrets
install -o root -g pitchcoach -m 0640 /安全上传目录/apiclient_key.pem /etc/pitch-coach/secrets/apiclient_key.pem
install -o root -g pitchcoach -m 0640 /安全上传目录/wechatpay_public.pem /etc/pitch-coach/secrets/wechatpay_public.pem
/opt/pitch-coach/bin/activate-api.sh
```

`pitchcoach-api.service` 通过自己的 StateDirectory 为 SQLite 提供可写目录，不修改或依赖现有 Redis。
账本需要 Node.js 22.13+ 自带的 `node:sqlite`；当前服务器 Node.js 22.23.0 已验证可用。
`SESSION_SECRET` 同时用于稳定的用户标识和短期报告加密，必须安全备份，不要随意轮换。轮换前需规划已有付费用户的额度迁移与短期缓存失效。

## 人工退款：先冻结额度，再退款，最后确认

先向用户核对商户订单号，再在服务器冻结仍未使用的额度：

```sh
cd /opt/pitch-coach/current
node --env-file=/etc/pitch-coach/api.env dist/refund-admin.js hold PC实际订单号
```

命令只能冻结 `paid` 状态；评审中或已使用的订单会拒绝冻结，防止边退款边使用。
然后由有权限的管理员在微信支付商户平台核对这笔交易并执行原路退款。确认退款已成功后，记录实际微信退款单号：

```sh
node --env-file=/etc/pitch-coach/api.env dist/refund-admin.js confirm PC实际订单号 实际微信退款单号
```

若已确定退款没有执行或已失败，才释放冻结：

```sh
node --env-file=/etc/pitch-coach/api.env dist/refund-admin.js release PC实际订单号
```

上述本地命令本身不转账。退款状态不明时维持冻结并查商户订单，不要释放，也不要反复退款。不要先在商户平台退款再冻结额度，否则可能与使用额度发生竞态。

## 数据和恢复边界

账本保留微信用户标识、支付订单、188 分金额、状态、微信交易号以及人工退款确认号，用于履约、对账和退款。
完整 BP 和原文件不写数据库；报告中的摘录仍属商业信息。付费报告缓存使用 AES-256-GCM 加密，领取后请求清理，最迟到期后移除缓存字段。数据库页和备份中的历史密文不等于物理擦除。
SQLite 文件、WAL 和稳定会话密钥需要纳入受控备份；不要清理该目录以“重置服务”。订单没有自动删除策略，运营者需按实际适用的交易记录保存要求管理。
本实现仍为单实例；不要让多个 API 实例同时运行针对同一数据库的中断恢复逻辑。

## 官方协议来源（2026-10-19 核对）

- [JSAPI/小程序下单](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_1.shtml)
- [小程序调起支付](https://pay.weixin.qq.com/doc/v3/merchant/4012791898)
- [商户订单号查询订单](https://pay.weixin.qq.com/doc/v3/merchant/4012791900)
- [支付成功回调通知](https://pay.weixin.qq.com/doc/v3/merchant/4012791902)
- [证书和密钥说明](https://pay.weixin.qq.com/doc/v3/merchant/4024350132)
- [开发接入准备](https://pay.weixin.qq.com/doc/v3/merchant/4015459512)
- [小程序支付常见问题](https://pay.weixin.qq.com/doc/v3/merchant/4012791910)

账本结构、云端持久化位置、压缩加密、三份备份与恢复演练见 [payment-storage.md](payment-storage.md)。
