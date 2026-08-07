# BL-IMG-GUANGTECH-CHANNEL 复验签收报告

## 结论

- 批次：`BL-IMG-GUANGTECH-CHANNEL`
- 被测提交：`4e068c86e702e0cc8cca3f71688f279069423743`
- 修复提交：`5b79aad`
- 阶段：`reverifying -> done`
- 结果：`F-GTI-01 PASS`，`F-GTI-02 PASS`
- 首验缺陷：`GTI-DEF-01` 至 `GTI-DEF-04` 全部关闭

四项首验缺陷均已通过独立复现、定向回归和全量回归验证。生产三个 guangtech 图片别名继续可用，虚假的 `supported_sizes` 声明已清除。本批次满足签收条件。

## 环境与范围

- L1：`http://localhost:3199`，按 `scripts/test/codex-setup.sh` 在持久 PTY 前台启动；独立 PostgreSQL 测试库端口 `63819`。
- L2：沿用首验三模型真实生图、代理文件、计费与失败不扣费证据；修复阶段仅对 `gpt-image-2` 做了尺寸解析所需的最小付费复测。本轮不重复付费调用。
- 生产只读核对：`https://aigc.guangai.ai/v1/models?modality=image` 与生产 PostgreSQL。
- UI：内置浏览器仍无可用实例，未取得渲染截图；组件/i18n/API 数据链路、定向测试和生产构建已通过。

## 复验结果

### GTI-DEF-01：失败 probe 仍落库

**PASS。** 固定返回 502 的 fake upstream 下执行 `--probe --apply --only=gpt-image-2`，进程以 1 退出且 `channelCount=0`。成功集合与失败集合混合时只允许成功目标进入 apply。

### GTI-DEF-02：复跑不收敛受管字段

**PASS。** 人工制造 `priority=3`、`supportedSizes=["512x512"]` 后复跑，分别收敛为 `priority=10` 与 SQL `NULL`；重复执行不新增 channel、alias 或 link。

### GTI-DEF-03：未验证实际图片尺寸却声明支持

**PASS。** 新增 PNG/JPEG/WebP 图片头解析；不可识别字节不再判成功，只有实际尺寸等于请求尺寸时才声明 `supported_sizes`。修复阶段单模型 L2 实测：请求 `1024x1024`，返回 `PNG 1254x1254`、约 `1464.7KB`、耗时约 `27.5s`，因此不声明尺寸能力。

当前生产 REST 与 SQL 均确认三个 alias 的 capabilities 不含 `supported_sizes`，model 的 `supportedSizes` 均为 `NULL`。

### GTI-DEF-04：存量管理员缺少新通知偏好

**PASS。** 新迁移 `20260807_backfill_notification_preferences` 已在全新 L1 数据库随全部 67 个 migration 成功执行。升级场景专项验证结果：

```json
{"adminRows":8,"developerRows":8,"adminOk":true,"devOk":true,"preserveOk":true,"countAfterFirst":16,"countAfterSecond":16,"idempotent":true}
```

迁移会补齐当前 enum 的全部事件，角色默认值与 `defaults.ts` 一致，且 `ON CONFLICT DO NOTHING` 保留既有用户设置并保证幂等。

## 回归证据

- evaluator 隔离复现脚本：`6/6 PASS`（首验为 `3/6 PASS`）。
- 定向 Vitest：`5 files / 30 tests PASS`。
- 全量 Vitest：`99 files PASS`，`813 passed / 4 skipped`。
- `npx tsc --noEmit`：PASS。
- `npm run lint`：PASS，0 error，10 条既有 warning。
- `npm run build`：PASS，`/admin/operations` 成功构建。
- smoke：`GET /v1/models` 200；管理员登录 200。

生产只读 SQL 复核三条 channel 均为 `ACTIVE / priority=10`，`realModelId` 为裸模型名；`costPrice=0.068836/call`，alias `sellPrice=0.082603/call`。公开 REST 返回三个 alias，售价一致，均无 `supportedSizes`。

首验 L2 的三条成功计费证据继续有效：

- `trc_kim712rregfsth0b7jmolotz` (`gpt-image-2`)
- `trc_a3ojnsgk0n08k5ow6yb8vjhb` (`gpt-image-1`)
- `trc_ojkf7fkkkyizba3v9f6usz2y` (`gpt-image-1.5`)

三条均为 `SUCCESS`，成本/售价 `$0.068836/$0.082603`，各扣费 `$0.082603`；不存在 alias 的 404 调用未扣费。验收临时 Key 已吊销。

## 残余风险

- 本批次应用与迁移尚未部署，故生产上的 F-GTI-02 通知、UI 和存量偏好回填尚未生效；部署时 `prisma migrate deploy` 会自动执行迁移。
- 内置浏览器连续两轮无可用实例，Admin 同步结果页缺少真实渲染截图；当前证据限于组件、i18n、数据链路、测试与构建。
- OpenRouter 欠费属于本批次范围外；guangtech 的 `costPrice` 仍是参照 OpenRouter 反推的名义成本，不代表已获知上游真实进价。

## 产物

- 首验报告：`docs/test-reports/BL-IMG-GUANGTECH-CHANNEL-verifying-2026-08-06.md`
- 测试用例：`docs/test-cases/BL-IMG-GUANGTECH-CHANNEL-verifying-2026-08-06.md`
- 隔离复现脚本：`scripts/test/bl-img-guangtech-channel-verifying-2026-08-06.ts`
- 本签收报告：`docs/test-reports/BL-IMG-GUANGTECH-CHANNEL-signoff-2026-08-07.md`
