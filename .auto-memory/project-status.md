---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- RATE-LIMIT：`building`（8 条功能，0/8 完成，7 generator + 1 codex）
- 规格：`docs/specs/RATE-LIMIT-spec.md`
- 基础已存：rate-limit.ts RPM 滑动窗口 + 60 RPM 默认 + 8 个入口接入
- Phase 1 核心：F-RL-01 启用 TPM 检查 / F-RL-02 三层维度（key/user/project）/ F-RL-03 突发熔断 / F-RL-04 消费速率保护
- Phase 2 管理端：F-RL-05 Project Settings UI / F-RL-06 Admin 全局默认值
- Phase 3 可观测：F-RL-07 SystemLog 限流审计
- 背景：AUDIT-CRITICAL-FIX 已部署，退款已执行（7 条共 $0.347）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX

## Backlog（延后）
- BL-065(支付验签，推迟) / BL-099(删除服务商) / BL-101(运维提示+系统日志 tab)
- BL-111(classifier 审批) / BL-113(IMAGE 参考定价) / BL-104(Settings 项目切换)
- BL-120(回溯 regression test) / BL-073(高风险路径测试)
