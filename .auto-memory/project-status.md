---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ROUTING-RESILIENCE-V2：`reverifying`（fix_rounds=1，3/4 generator 已完成，F-RR2-04 待 Reviewer 重测）

## Fix Round 1 产物（2026-04-17）
- `src/lib/engine/cooldown.ts` 新增 `isTransientFailureReason` 关键字分类器
- `src/lib/health/scheduler.ts` transient 失败不计 DISABLE 阈值，写 cooldown + 停 DEGRADED
- `src/lib/engine/router.ts` latest FAIL 分 transient/permanent，transient 保留降权
- 单测：cooldown.test.ts 15 / router.test.ts 4；tsc+vitest 72/72+build 全过
- 生产运维：zhipu glm-4.7-flash 通道 `UPDATE status='ACTIVE'` 已恢复

## BL-128b 完成（2026-04-17 运维）
- 生产 seed 6 个营销模板 + 8 actions（System Templates 项目，isPublic=true）
- 模型：deepseek-v3 主力 / qwen3.5-flash JSON step / qwen3.5-plus 策略长文
- 冒烟测试 6/6 PASS（MCP run_template），小瑕疵 2 处（#2 品牌臆造、#4 代码块）待下批次迭代
- 生产公共模板现 9 条：3 dev-review + 2 social-content + 1 ip-persona + 1 short-video + 2 marketing-strategy

## 上一批次（ONBOARDING-ENHANCE done）
- 3 个 migration 生产已生效（2026-04-17 05:27 UTC）

## 生产状态
- zhipu glm-4.7-flash 已人工恢复 ACTIVE
- ROUTING-RESILIENCE-V2 fix round 1 代码尚未部署，部署前 zhipu 可能再次被 DISABLE
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
