---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-FIX-PHASE2：`verifying`**（OR image-via-chat 治本修复）
- F-RP-01 调研推翻初设：completion_tokens 已含 image_tokens（1304≈14 文本+1290 image），真根因是 image-output 单价 ≈ \$30/M vs 文本 \$2.5/M，单价错位非 token 缺失
- 选方案 B：用 OR 直返 usage.cost 短路 token×单价 公式（commits df5340c / e0bc4e8 / 2ce2556）
- F-RP-04 验收待 Codex；生产实证需重创 admin API key（memory pk_aa6b13... 已过期 401）
- 7 ⚠️ channel 全部不动配置；zhipu cogview-3 留未来启用单独验证

## 上一批次（已 done）
- BL-RECON-FIX-PHASE1（fetcher + 货币 + audit 报告）@ 2026-04-27（4/4 PASS，0 fix_round）
- F-RF-03 audit 输出 7 个 ⚠️ token-priced image channel：6 OR + 1 zhipu

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- F-RP-04 实证调用花 ~$0.04 真钱（admin API key 经 https://aigc.guangai.ai 调用 gemini-2.5-flash-image）
- 修后所有 7 个 ⚠️ channel 不需改 costPrice 配置（保持 token-priced；公式自动算对）
- zhipu cogview-3（第 7 个 ⚠️）不在本批次，未来启用再单独看
