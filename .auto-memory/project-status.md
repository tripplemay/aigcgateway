---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`fixing` fix_round=1**（Codex 复验 FAIL，等待 Generator 修复）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15

## 复验结论（2026-04-25 Reviewer）
- 本地 `npm run build` PASS；`npx tsc --noEmit` PASS；`npx vitest run` 385 PASS
- 生产 migration transaction dry-run PASS；DB trigger IMAGE zero update blocked / TEXT zero update passed
- 6 条 OR token-priced image channel DB 定价正确，且 `/api/admin/sync-models` 后仍保持 token cost
- **FAIL：全库 39 条 IMAGE channel 中 32 条仍为 `costPrice.perCall=0`**，不满足 F-BIPOR-05 #11/#12
- **FAIL：canonical image smoke HTTP 200，但 `call_logs.costPrice=0` 且 tokens 为 null**，不满足 #10
- **FAIL：`verify-or-image-channels-2026-04-25.ts` 使用不存在别名 `gemini-2.5-flash-image`**
- **FAIL：pricing CLI 在 `.env.production` 下因 Redis handle 不退出，idempotency timeout 124**
- **SPEC GAP：model-sync endpoint 实为 `/api/admin/sync-models`，不是 `/api/admin/run-inference`**

## 当前状态文件
- `features.json`: F-BIPOR-01 / F-BIPOR-03 / F-BIPOR-05 → pending；F-BIPOR-02 / F-BIPOR-04 completed
- `progress.json`: status=`fixing`，signoff=null，evaluator_feedback 已写入
- 复验报告：`docs/test-reports/BL-IMAGE-PRICING-OR-P2-reverifying-2026-04-25.md`

## 后续 backlog（按 order）
- BL-IMAGE-LOG-DISPLAY-FIX (103)：base64 转存对象存储 + 前端图片预览（OR-P2 done 后启动）
- BL-SEC-* (1-4): 安全加固（接支付前启动）
