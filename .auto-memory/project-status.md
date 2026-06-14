---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-VISION-INPUT**（**done**，2026-06-14）— 网关图片输入（vision/多模态）已上线生产。REST `/v1/chat/completions` 接受 OpenAI 多模态（content 数组+image_url，URL+base64），严格按 `capabilities.vision` 门禁。L1 独立子 agent 验收（58 单测）+ L2 生产真实 E2E 全 PASS：图片输入 URL+base64 正确理解、门禁拒非 vision(400 model_not_vision_capable)、协议/数量限制、计费含图片 token、日志卫生 DB 无 base64、流式回归。生产 20 vision alias 标记就位。**顺带修 BL-093 遗留 CI 红**(runner.test.ts,6d3a919)。计费/格式转换(全 OpenAI 兼容端点含 Anthropic)/流式自动覆盖。MCP chat 图片输入未做(另起批次)。signoff：`docs/test-reports/BL-VISION-INPUT-signoff-2026-06-14.md`。spec+ops：`docs/specs/BL-VISION-INPUT-*.md`。

## harness-template 同步（2026-06-05 已解决）
- L1/L2 已同步到 harness-template **v0.9.21**（planner.md 铁律 8 + generator.md §9，commit f3cd49c 已推送）；proposed-learnings 已归档。
- reconcile：本地 stale clone（旧 v0.9.5 线）`reset --hard origin/main`(v0.9.20)，旧线存 `backup-local-v0.9.5-line-20260605` 分支。
- **遗留**（非紧急）：aigcgateway 旧线 v0.9.6–v0.9.10（铁律 1.1–1.8 等）未并入 canonical（两项目曾各推各线），仅存 backup 分支，待后续单独 reconcile。

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-IMG-SEEDREAM45 @ 2026-06-05（done，fix_rounds=1）— Seedream 4.5 接入 + http 上游→GCS 真实 E2E。signoff：`docs/test-reports/BL-IMG-SEEDREAM45-signoff-2026-06-05.md`
- BL-IMG-PERSIST-GCS @ 2026-06-04（hotfix done，fix_rounds=2）— 图片生成转存 GCS（三形态归一 + 同源代理回源 GCS TTL90d）；已部署生产。signoff：`docs/test-reports/BL-IMG-PERSIST-GCS-signoff-2026-06-04.md`
- BL-FE-DS-SHADCN-MINI-A @ 2026-05-03（done）— 3 高频 admin 页 raw→shadcn 组件壳替换

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
