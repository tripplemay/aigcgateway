---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-SEEDREAM45**（**done**，2026-06-05）— Seedream 4.5（`doubao-seedream-4-5-251128`，¥0.20/张）已签收。生产 `/v1/models` 含 `seedream-4-5`；独立真实 E2E `trc_xkmj5yhk3lknm7wu85u0pmox` 返回同源代理 URL，`GET 200 image/jpeg`，`original_urls[0]` 为 GCS key 且 `gsutil stat` 确认落桶；日志详情 `images[0]` 正常；计费 `0.0274 / 0.03288` 与 ¥0.20 / ¥0.24 × 0.137 一致；脚本幂等复用首轮 `created -> updated` 证据通过。fix_round1 用户裁决生效：本地 `/v1/models` 空与本地 `.next/types` TS6053 视为测试环境既有限制，不阻断签收。signoff：`docs/test-reports/BL-IMG-SEEDREAM45-signoff-2026-06-05.md`。

## harness-template 同步（2026-06-05 已解决）
- L1/L2 已同步到 harness-template **v0.9.21**（planner.md 铁律 8 + generator.md §9，commit f3cd49c 已推送）；proposed-learnings 已归档。
- reconcile：本地 stale clone（旧 v0.9.5 线）`reset --hard origin/main`(v0.9.20)，旧线存 `backup-local-v0.9.5-line-20260605` 分支。
- **遗留**（非紧急）：aigcgateway 旧线 v0.9.6–v0.9.10（铁律 1.1–1.8 等）未并入 canonical（两项目曾各推各线），仅存 backup 分支，待后续单独 reconcile。

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-IMG-PERSIST-GCS @ 2026-06-04（hotfix done，fix_rounds=2）— 图片生成转存 GCS（三形态归一 + 同源代理回源 GCS TTL90d），修 MCP base64 死链 + b64_json 空数组 + 日志不可回看 + 1h/24h 过期；已部署生产。signoff：`docs/test-reports/BL-IMG-PERSIST-GCS-signoff-2026-06-04.md`
- BL-FE-DS-SHADCN-MINI-A @ 2026-05-03（done，fix_rounds=0）— 3 高频 admin 页 raw→shadcn 组件壳替换（recon/providers/model-aliases），signoff PASS
- BL-SYNC-INTEGRITY-PHASE2 @ 2026-05-02（done，fix_rounds=1）— 软停 259 disabled-alias-only channel + sync-status 度量重定义 + 抽 sql/alias-status.ts 共享谓词

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升（剩余 15+ 文件，2026-05-03 复核仍 defer：MINI-A + 渗透工程纪律双轨已消化高价值部分）

## proposed-learnings
- 最新同步 harness-template **v0.9.21**（2026-06-05：铁律 8 外部模型可用性 + Generator §9 standalone origin，来源 BL-IMG-PERSIST-GCS）
- 旧线 v0.9.6–v0.9.10（铁律 1.1–1.8 等）见上「遗留」：未并入 canonical，存 backup 分支

## 生产旁路修复
- 2026-04-30：alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 改 true + 4 个 alias sellPrice 已补
- 2026-05-02：disable-orphan-zero-price-channels.ts 软停 263 个 disabled-alias-only channel（生产 SSH 跑），sync-status disabledAliasOnly 259→0 / unpricedActiveAliases 0（无 leak）/ 旧 zeroPriceActiveChannels 310→56（仅"无害零价"）
