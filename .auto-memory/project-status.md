---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**reverifying**，fix_rounds=2，7/8）— 2026-07-27 从 hotfix 还原，F-IIV-08 待 Codex 复验，`docs.signoff=null`。
- **利好**：生产已升到 `f16d2b7`，**IIV-DEF-03 的修复（72e58b8）现在才真正上线**（挂起时生产还是 07-12 镜像），L2 计费复验到现在才具备条件。
- **🔴 阻塞 A**：`seedream-4-5`（i2i 首发、唯一上游实测通过的模型）通道当前 **DISABLED** 且长期抖动，已被自动恢复 **59 次**。根因：realModelId 是火山接入点 ID `ep-2026…`，按设计永不出现在 `/models`；`model-sync` 的 `toDisable` 每轮下架它，健康检查 reachability 恢复再转回，两边对打。hotfix 的 `vetoRecovery` 已豁免 `quirks.endpointMap`，但 `toDisable` 无同等豁免 —— 早于 hotfix 存在的盲区。
- **🔴 阻塞 B**：OpenRouter 又欠费（credits 595 / usage 595.13）→ `gpt-image`、`gemini-3-pro-image` 会 402。
- **🔴 阻塞 C**：`provision-i2i-capabilities.ts --apply` 生产未跑 —— 三别名 `capabilities.image_to_image` 均空，i2i 门禁会拒绝所有带源图请求。
- 图片计费未受 hotfix 影响（IMAGE 模态 `buildCostPrice` 返回 null，不动 costPrice；seedream 仍 `{perCall:0.2}`）。

## 上一批次（done）
- **BL-DEEPSEEK-V4-HOTFIX**（done + 已上线 2026-07-27）— 14/14 PASS，signoff `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-signoff-2026-07-26.md`，状态归档 `docs/archive/*-BL-DEEPSEEK-V4-HOTFIX-done.json`。
- **遗留 A**：通道 costPrice 全零 — qwen 185/185、siliconflow 62/68、zhipu 6/8、deepseek v4 两条。成本毛利失真，卖价不受影响。
- **遗留 B**：siliconflow 4 + openrouter 2 条目录缺席通道将一直 DISABLED，需运维判断置回或保持。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。
