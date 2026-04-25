---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`reverifying` fix_round=2 完成**（4/5 generator + Codex 13 项验收 pending）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15

## fix_round 2 处理 5 项 FAIL（Path A 全修）
- #1 32/39 IMAGE 残留 0 → 部署后 ssh 重跑 P1 fix-image-channels-2026-04-24.ts --apply（脚本幂等，无代码改动）
- #2 image-via-chat token cost calc → ImageGenerationResponse 加 usage / imageViaChat 5 路 return propagate / processImageResultAsync 据 costPrice.unit 分支 / call_log 写入 promptTokens/completionTokens/totalTokens
- #3 verify alias → google/gemini-2.5-flash-image（OR canonical 全名）
- #4 pricing CLI Redis hang → redis.ts disconnectRedis() helper；5 个脚本调用
- #5 endpoint → /api/admin/sync-models（spec/adjudication/features 全改）

## 验证（本地）
- vitest 390 PASS（+5 image-via-chat-token-cost）/ tsc / build 全过

## Codex F-BIPOR-05 13 项验收路径（reverifying）
- #1-#11 部署后 + apply + 抽查 + smoke
- #12 model-sync 回归保护：POST /api/admin/sync-models 后 36+ image channel costPrice 全部保持
- #13 signoff

## 生产部署链
1. GitHub Actions deploy fix_round_2 commits
2. ssh: P1 script --apply 恢复 30 条 P1 定价
3. POST /api/admin/sync-models 触发 sync → 重查全部保持
4. verify-or-image-channels-2026-04-25.ts smoke 验证 cost > 0 + 公式匹配
5. trigger 反例 SQL

## 决策（继承 P1/P2）
- USD 口径 + sellPrice = costPrice × 1.2
- 数据源 OR /api/v1/models canonical
- 不修复 gpt-image-2 / -ca（保守填值沿用）
- 不回填历史 call_logs

## 后续 backlog
- BL-IMAGE-LOG-DISPLAY-FIX (103)：base64 转存对象存储 + 前端图片预览（OR-P2 done 后启动）
- BL-SEC-* (1-4): 安全加固（接支付前启动）
