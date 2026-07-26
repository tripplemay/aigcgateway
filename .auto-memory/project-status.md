---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**verifying**，2026-07-25 插队开批，5/5 generator 一轮完成）— 生产故障止血 + 自动兜底修复。spec: `docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`，待 Codex 执行 F-DSV4-06。
- **生产已止血**：3 条 deepseek 直连陈旧通道 DISABLED，四别名（v3/r1/v4-pro/v4-flash）真实调用恢复且计费正常。
- **⚠️ 部署顺序**：F-DSV4-03 带 migration，`backfill-notification-preferences.ts --apply`（174 行）必须在 migration 落地**之后**跑。
- **F-DSV4-03 挖出的既有缺陷**：dispatcher 对「无通知偏好行」静默丢弃，生产 5 个 ADMIN 一条偏好行都没有 → 管理员类通知从上线起从未送达（notifications 表 0 行）；AUTH_ALERT 进了 enum+trigger 却没进 seed/API/UI，纯死信。已一并修复。
- **顺带发现、未修**（建议另开数据治理批次）：token 计价 ACTIVE 通道 costPrice 全零 — qwen 185/185、siliconflow 62/68、zhipu 6/8、minimax/guangtech 各 5/5、xiaomi-mimo 2/2、openrouter 5/332。成本记 0、毛利失真（卖价正常，用户不受影响）。
- **故障**：DeepSeek 直连 API 下线 `deepseek-chat` / `deepseek-reasoner`（实测 /models 只剩 `deepseek-v4-pro` / `deepseek-v4-flash`）。生产 3 条 deepseek 直连通道 realModelId 陈旧，其中两条占 priority=1（router ASC 取优），上游 400 → `INVALID_REQUEST` ∈ `NEVER_RETRY` → 无 failover → `deepseek-v3` 别名硬失败（call_logs 5 条 ERROR）。
- **两层兜底同时失效**：① `model-sync.ts:489` 缩水护栏（2 < 5×0.5）自 07-21 连续 5 天静默拦截自动下架，只 console.log 无告警；② 健康检查调度器 `2026-07-23T05:15:31Z lost leadership → stopScheduler` 终局，无重抢路径，单副本 → **全站健康检查已停摆 2 天**（health_checks max=07-23 05:12）。
- **功能**：F-DSV4-01 止血下架陈旧通道（critical）/ -02 调度器丢锁自动重抢（critical）/ -03 护栏告警可见化 / -04 清理 `internal-llm` 链首 `deepseek-chat` 硬编码 / -05 模型名类 400 重分类为可 failover / -06 Codex 验收。
- **裁决**：不把 v3/r1 别名重指 v4（语义不能偷换）；止血用"下架"非"改 realModelId"；不动护栏阈值。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 Codex 复验待做（IIV-DEF-03 修复 commit 72e58b8 待验），`docs.signoff=null`。状态已归档 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`，hotfix done 后由 Planner 还原。
- **待裁决**（沿用）：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced（可选）。生产 `provision-i2i-capabilities.ts --apply` 未跑。

## 更早遗留（仍有效）
- **BL-PROD-MIGRATE-DEPLOYSVR**（done 2026-07-12）：生产已迁 deploysvr(194.238.26.173，容器化)。**🔴P6 旧机退役** + **kolmatrix 迁移**待用户择机。
- alias capabilities 历史双层嵌套 + seedream-4-5 supported_sizes 陈旧（建议后续清洗批次）。

## Backlog（3 条）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`，容器 `aigc-gateway-{app,postgres,redis}-1`）。
