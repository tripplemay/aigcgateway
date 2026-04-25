---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`reverifying` fix_round=1**（4/5 generator 完成 → Codex 13 项验收）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15
- 上上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35

## OR-P2 5 features
- F-BIPOR-01/02/03 ✓ completed
- F-BIPOR-04 ✓ completed（fix_round 1：buildCostPrice IMAGE→null R1 方案）
- F-BIPOR-05 codex 13 项验收 pending

## fix_round 1 修复（裁决路径 X）
- model-sync.ts buildCostPrice() IMAGE → null（保留运营值，不被 sync 覆盖）
- 拆 buildInitialCostPrice() 给 createMany 新建 channel 用
- 调用处 update 时 null → 省略 costPrice 字段
- 新增 7 单测 + invariant 显式声明

## 验证（本地）
- vitest 385 PASS（+7 fix_round 1 新单测）
- tsc / build 全过

## Codex F-BIPOR-05 13 项验收路径
- #1-#11 build/tsc/vitest + apply + 抽查 + 幂等 + trigger 反例 + smoke + 全库扫
- #12（裁决新增）model-sync 回归保护：deploy → apply → POST /api/admin/run-inference → 重查 30+6 条 image channel costPrice 不被冲回 0
- #13 signoff

## 决策（继承 P1/P2）
- USD 口径 + sellPrice = costPrice × 1.2
- 数据源 OR /api/v1/models canonical
- 不修复 gpt-image-2 / -ca（保守填值沿用）
- 不回填历史 call_logs

## 后续 backlog（按 order）
- BL-IMAGE-LOG-DISPLAY-FIX (103)：base64 转存对象存储 + 前端图片预览（C 方案，OR-P2 done 后启动）
- BL-SEC-* (1-4): 安全加固（接支付前启动）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
