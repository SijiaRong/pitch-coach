# 支付账本的持久化与空间控制

## 数据位置和范围

生产账本应保存在部署者自己的服务器，例如 `/var/lib/pitchcoach-api/payments.sqlite`。
它是独立于代码版本目录的持久文件；进程重启、代码升级及切换 `current` 链接不删除账本。
生产配置拒绝内存账本或相对路径。不能把账本放到 `/tmp`、容器临时层或 `releases` 下。

SQLite 保持 WAL 与 `synchronous=FULL`；付款入账、预留额度、完成扣除和恢复额度均用事务保护。
当前仍只支持一个 API 实例。不要手动修改余额、删除订单或把 SQLite 主文件单独热拷贝当作完整备份。

## 精简后的 schema v2

| 表 | 保存内容 | 空间策略 |
| --- | --- | --- |
| `pay_users` | 每用户一个整数 ID、HMAC 用户标识、加密 OpenID | 长标识仅保存一次；登录信息不变时不重复写入 |
| `pay_orders` | 用户整数引用、商户/微信订单号、金额、币种、支付与退款状态 | 整数状态；付款确认后清除已无用途的预支付凭据 |
| `pay_evaluations` | 用户与订单整数引用、任务 ID、请求摘要、使用状态 | SHA-256 固定长度幂等摘要；不混存报告正文 |
| `pay_report_cache` | 待领取报告的加密压缩缓存 | DEFLATE 压缩后 AES-256-GCM 加密，领取或到期后删除 |
| `pay_metadata` | 密钥校验及小程序/商户绑定 | 拒绝错误密钥和跨商户误用同一账本 |

只对历史查单和仍活跃的数据建立必要索引。未使用额度、交易凭据、退款确认和幂等记录不因报告过期而删除。

报告解密需先通过认证，再进行解压；解压结果限制 1 MiB，避免异常数据膨胀。OpenID 使用独立用途的派生密钥加密。
SQLite 主文件并非全库加密：订单号、金额、状态等对账元数据仍是数据库字段；报告和 OpenID 是加密字段。
数据库、WAL/SHM 和备份目录均属于专用用户，目录 0700、数据库/备份 0600。密钥保存在独立的 root 配置，不进入备份包。

## 释放空间与 WAL

- 报告缓存最长保留 10 分钟；进程运行时定时清理，停止期间由维护任务清理。
- 新账本在建表前开启增量空间回收，每轮最多回收 64 页，避免每次查询触发全库整理。
- 清理按一分钟节流；金融记录不做过期清除。
- WAL 每约 256 页触发检查点，检查点后常态保留上限约 1 MiB。活跃读事务可能使 WAL 暂时超过该值，不能把它当硬性容量限制。
- schema v1 自动在事务中迁移；所有订单和任务计数校验、外键检查成功后才提交。未知状态、损坏的有效报告导致回滚，不跳过账目。
- 旧库迁移释放的页可以直接复用；旧库若原来未启用增量回收，物理文件不一定立即缩小。不要在服务高峰手动执行 `VACUUM`；需要缩小时，应先验证备份，安排本应用停机再整理。当前云端账本为新建 v2，已启用增量回收。

## 三份压缩加密备份

`pitchcoach-ledger-maintenance.timer` 每天北京时间 03:15 后随机延迟不超过 20 分钟执行一次：

1. 清理过期报告，做有界的空间回收和 WAL 检查点。
2. 用 SQLite Online Backup API 取得包含已提交 WAL 事务的一致快照并检查完整性。
3. Gzip 压缩，再用 AES-256-GCM 加密到 `/var/lib/pitchcoach-api/backups/`。
4. 成功后仅保留最近三份本功能生成的备份；失败时不删原有成功备份。

维护进程单独限制为 CPU 20%、内存 256 MiB、低 CPU/磁盘优先级，且禁止网络访问。备份过程中会临时占用一份数据库快照和待完成备份的空间；临时文件在专用私有目录中，正常完成或失败后清理，异常退出留下的工作文件在后续维护中按一天过期清理。

这些备份仍在同一台服务器，不能覆盖整块云盘损坏或整机丢失的灾难恢复场景。异地副本或阿里云云盘快照尚未配置；需要另外确定存储位置、保留策略和费用。`SESSION_SECRET` 必须在其他安全位置独立保管，遗失后无法解密备份及身份信息。

查看和立即执行：

```sh
systemctl list-timers pitchcoach-ledger-maintenance.timer
systemctl start pitchcoach-ledger-maintenance.service
journalctl -u pitchcoach-ledger-maintenance.service -n 20 --no-pager
```

## 安全恢复演练

使用 root 专用环境文件加载密钥，将备份恢复到一个**不存在的新文件**，不直接覆盖运行中的账本：

```sh
cd /opt/pitch-coach/current
node --env-file=/etc/pitch-coach/api.env dist/payment-maintenance.js restore \
  /var/lib/pitchcoach-api/backups/实际备份文件.sqlite.gz.enc \
  /var/lib/pitchcoach-api/restore-check.sqlite
```

恢复会校验 GCM 认证标签、SQLite 完整性和外键，失败会清理临时输出。现有文件不会被覆盖。
如需正式替换，先停止**本应用** API，保留当前账本和 WAL/SHM 的完整副本，再处理 SQLite 文件替换及文件属主，验证订单和额度后启动。本命令不自动替换 live 文件，也不转账。
恢复历史快照后需核对快照之后的微信支付交易及额度使用情况，不能假定日备份可恢复到故障前最后一笔。

## 2026-10-19 模拟数据测量

使用相同的 100 个虚构用户、3,000 笔虚构交易及 2,400 条评审记录，对整理后的文件比较（不含备份）：

| 项目 | 原结构 | 优化后 | 减少 |
| --- | ---: | ---: | ---: |
| 紧凑账本文件 | 1,912,832 B | 1,126,400 B | 41.1% |
| 单份报告缓存（含认证开销） | 25,384 B | 4,939 B | 80.5% |

测量包含密钥校验元数据，不含备份和运行中的 WAL；实际比例取决于订单、用户和报告分布，不作为容量保证。

参考：[SQLite WAL](https://www.sqlite.org/wal.html)、[PRAGMA](https://www.sqlite.org/pragma.html)、[Online Backup](https://www.sqlite.org/backup.html)。
