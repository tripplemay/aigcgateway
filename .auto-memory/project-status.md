---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`fixing` fix_round=1**（mid-impl 裁决路径 X 后）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15
- 上上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35

## OR-P2 状态（5 features，3/5 完成）
- F-BIPOR-01/02/03 ✓ completed（vitest 378 PASS）
- **F-BIPOR-04 pending**：model-sync.buildCostPrice 回归修复（IMAGE 跳过 costPrice 写入，R1 方案）
- F-BIPOR-05 codex 13 项验收（含 #12 sync 跑后回归保护）

## Mid-Impl 裁决（2026-04-25 13:00 路径 X）
- 元凶：src/lib/sync/model-sync.ts:100-109 buildCostPrice IMAGE 硬编码 {perCall:0}
- 链路：每日 model-sync → 第 270-280 行 prisma.channel.update → 强制覆盖 costPrice → 04:00 全 image channel 回零（sellPrice 因 sync 不写该字段保留正确）
- 生产实证：30 条 P1 image channel updatedAt 集中 2026-04-25 04:00:18~04:01:16；call_logs.source='sync' 4 条同时段
- 裁决文档：docs/adjudications/2026-04-25-or-p2-buildcostprice-regression.md

## OR-P2 后续 backlog（按 order）
- **BL-IMAGE-LOG-DISPLAY-FIX (order=103)**：base64 转存对象存储 + 前端图片预览（C 方案，6 features 1.0d）— OR-P2 done 后立即启动
- BL-SEC-* (1-4): 安全加固（接支付前启动）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)

## 用户报告的生产 image log 显示问题（已诊断）
- 根因：OR image base64 data URL（~1MB/张）直接落库 + 前端纯文本渲染
- 临时影响：仅 OR 6 条 image alias 有问题，volcengine/qwen 不受影响
- 永久修：BL-IMAGE-LOG-DISPLAY-FIX C 方案

## Framework v0.9.4 应用
- 本裁决严格遵循 pre-impl-adjudication.md §10 mid-impl 流程：触发条件 / 用户拍板 / spec 修订 / 验收新增 / 裁决文档归档
