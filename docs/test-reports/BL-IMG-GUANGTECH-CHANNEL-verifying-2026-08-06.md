# BL-IMG-GUANGTECH-CHANNEL 首轮验收报告

## 结论

- 批次：`BL-IMG-GUANGTECH-CHANNEL`
- 被测提交：`b4983af2d47c2fdef8764dd7dae48dcb468fcab6`
- 阶段：`verifying -> fixing`
- 结果：`F-GTI-01 FAIL`，`F-GTI-02 FAIL`
- 签收：不签收，`docs.signoff` 保持 `null`

生产侧三个新 alias 的主链路和计费已经可用，但 provisioning 脚本违反失败探测不得落库的安全约束，也不能把受管字段收敛到规格值。sync 告警核心代码通过单测，但正常部署后现有管理员没有新事件偏好行，通知会静默丢弃。

## 环境与范围

- L1：`http://localhost:3199`，由 `scripts/test/codex-setup.sh` 前台启动；独立 PostgreSQL 测试库。
- L2：`https://aigc.guangai.ai`，使用临时最小权限测试 Key；验收后已吊销并确认 `REVOKED`。
- 生产数据写入：创建并吊销一个临时测试 Key；三次已授权真实图片调用及其正常计费；一次不存在模型的失败调用；未执行数据删除、充值、批量修改或通知发送。
- UI：内置浏览器本轮无可用实例，未做渲染截图；以组件源、i18n、API 数据链路和生产构建为证据，保留渲染验证缺口。

## 通过项

### L1

- smoke：`GET /v1/models` 200；管理员登录 200；服务正常启动。
- 新 migration 在空库成功应用。
- F-GTI-02 定向回归：3 files / 17 tests 全部通过。
- 全量 Vitest：97 files，`800 passed / 4 skipped`。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过，有 10 条既有 warning，无 error。
- `npm run build` 通过；`/admin/operations` 成功产出。
- provisioning 默认 dry-run 不写库；首次 apply 创建 3 channel / 3 alias / 3 link；第二次 apply 行数不变。
- F-GTI-02 的 WARN、通知触发、空集合静默、相同集合抑制、集合变化重发、失败释放去重键均通过。
- Admin 组件会从 `providers[].skippedImageChannels` 展开历史结果；新增中英文文案均走 `next-intl`。

### L2

- `/v1/models` 与 MCP `list_models(modality=image)` 均列出 `gpt-image-1`、`gpt-image-1.5`、`gpt-image-2`，价格均为 `$0.082603/call`。
- 三个 alias 的 `/v1/images/generations` 均 HTTP 200；耗时分别约 34.7s、33.4s、30.0s。
- 三个签名代理 URL 均返回 `HTTP 200`、`content-type: image/png`，证明同源代理与持久化读取链路可用。
- 三条 CallLog 均 `SUCCESS`，`costPrice=0.06883600`、`sellPrice=0.08260300`，并各有 `DEDUCTION -0.08260300`：
  - `trc_kim712rregfsth0b7jmolotz` (`gpt-image-2`)
  - `trc_a3ojnsgk0n08k5ow6yb8vjhb` (`gpt-image-1`)
  - `trc_ojkf7fkkkyizba3v9f6usz2y` (`gpt-image-1.5`)
- 不存在 alias 返回 404 `model_not_found`；调用前后余额 `5.38742446`、交易数 `72` 均不变。
- 生产只读 SQL：3 channel 均 ACTIVE / priority 10 / 裸 realModelId / 正确定价；3 model enabled 且 `supportedSizes IS NULL`；3 alias/link 完整。

## 缺陷

### GTI-DEF-01 [High] 探测失败仍会被 `--probe --apply` 落库

- 功能：F-GTI-01
- 位置：`scripts/add-guangtech-image-channels.ts:470-506`
- 复现：本地 fake upstream 固定返回 502，执行 `--probe --apply --only=gpt-image-2`。
- 实际：CLI 先打印 `[FAIL] gpt-image-2`，随后打印 `[created]`，exit 0，channelCount=1。
- 预期：失败模型不得 apply；CLI 应阻断该模型并以非零退出，或只 apply 明确探测成功集合。
- 证据：`scripts/test/bl-img-guangtech-channel-verifying-2026-08-06.ts`，总结果 `3/6 PASS`。

### GTI-DEF-02 [Medium] 幂等复跑不收敛 `priority` 与 `supportedSizes`

- 功能：F-GTI-01
- 位置：`scripts/add-guangtech-image-channels.ts:350-385`
- 复现：首次 apply 后把 `gpt-image-2` 的 `priority` 改为 3、`supportedSizes` 改为 `["512x512"]`，再 apply。
- 实际：仍为 `priority=3`、`supportedSizes=["512x512"]`。
- 预期：规格声明的受管字段应收敛为 `priority=10`、`supportedSizes=null`。

### GTI-DEF-03 [High] probe 未验证实际图片尺寸，却声明支持 `1024x1024`

- 功能：F-GTI-01
- 位置：`scripts/add-guangtech-image-channels.ts:220-238,395,405`
- 实际：probe 只解码 base64 并记录字节数，未验证图片签名或像素尺寸；三个生产请求都传入 `1024x1024`，实际代理 PNG 全部为 `1254x1254`。交接记录也只包含 KB 与耗时，没有 acceptance 要求的 actual size。
- 影响：`list_models`/MCP 对外声明 `supported_sizes=["1024x1024"]`，但上游并未按该尺寸返回，能力元数据失真。
- 预期：解析并验证图片格式与实际像素尺寸；只有返回尺寸符合时才把请求尺寸写入 `supported_sizes`，否则不得声明并应记录上游偏差。

### GTI-DEF-04 [High] 正常部署后现有 ADMIN 收不到新通知

- 功能：F-GTI-02
- 位置：`src/lib/notifications/defaults.ts:67-70`、`src/lib/notifications/dispatcher.ts:67-74`、`.github/workflows/deploy.yml:92-94`
- 实际：defaults 只影响新建用户；部署流程只跑 `prisma migrate deploy`，没有执行偏好回填。生产只读 SQL 显示现有 ADMIN `5` 个，拥有 `SYNC_IMAGE_CHANNEL_SKIPPED` 偏好行的为 `0`。dispatcher 对缺少偏好行直接返回 false，通知静默丢弃。
- 预期：通过可部署、幂等的数据迁移或部署步骤自动为存量用户补齐新事件偏好，并增加覆盖存量用户升级场景的测试；不能依赖仅存在于 handoff 的人工提醒。
- 备注：`scripts/backfill-notification-preferences.ts --apply` 能补行，但未纳入本批 ops runbook 或部署自动化，且当前 F-GTI-02 尚未部署。

## 风险与后续

- 生产三个 guangtech alias 当前可调用且计费正确，缺陷主要影响后续重放安全、能力元数据准确性与 F-GTI-02 部署后的通知可达性。
- 生产 app 仍是本批部署前镜像；F-GTI-02 的 migration/UI/通知代码尚未上线。
- OpenRouter 欠费属于范围外，未纳入本轮结论。
- 修复后必须复验四个缺陷；F-GTI-01 的生产主链路无需重复三次付费调用，除非尺寸验证实现需要最小必要的单模型 L2 复测。

## 产物

- 测试用例：`docs/test-cases/BL-IMG-GUANGTECH-CHANNEL-verifying-2026-08-06.md`
- 隔离重放脚本：`scripts/test/bl-img-guangtech-channel-verifying-2026-08-06.ts`
- 本报告：`docs/test-reports/BL-IMG-GUANGTECH-CHANNEL-verifying-2026-08-06.md`
