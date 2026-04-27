---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-FIX-PHASE2：`building`**（OR image-via-chat 治本修复，~2h）
- 用户 2026-04-27 选方案 B（修适配层）；非方案 A（全量 perCall 配置）/非 C（仅修 2 条）
- 真根因：src/lib/engine/openai-compat.ts:703-723 extractUsage 仅读 prompt/completion/reasoning_tokens，忽略 image-output tokens；channel costPrice token 单价与 OR 官方一致非问题
- 4 features：F-RP-01 调研（H1/H2/H3）→ F-RP-02 修 extractUsage（按结论选 A/B/C 分支）→ F-RP-03 集成测 ±15% → F-RP-04 含生产实证
- 实证目标：1 次 gemini-2.5-flash-image 调用 → CallLog.costPrice ∈ [$0.030,$0.045]（OR 实收 $0.0387 ±15%）
- 调研报告：docs/audits/openrouter-image-usage-shape-2026-04-27.md（待 Generator 写）

## 上一批次（已 done）
- BL-RECON-FIX-PHASE1（fetcher + 货币 + audit 报告）@ 2026-04-27（4/4 PASS，0 fix_round）
- F-RF-03 audit 输出 7 个 ⚠️ token-priced image channel：6 OR + 1 zhipu

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- F-RP-04 实证调用花 ~$0.04 真钱（admin API key 经 https://aigc.guangai.ai 调用 gemini-2.5-flash-image）
- 修后所有 7 个 ⚠️ channel 不需改 costPrice 配置（保持 token-priced；公式自动算对）
- zhipu cogview-3（第 7 个 ⚠️）不在本批次，未来启用再单独看
