---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- REGRESSION-BACKFILL：`building`（6 条功能，0/6 完成，5 generator + 1 codex）
- 规格：`docs/specs/REGRESSION-BACKFILL-spec.md`
- F-RB-01: BILLING-REFACTOR 回溯（billing 精度 + alias.sellPrice 驱动）
- F-RB-02: AUDIT-SEC 回溯（disabled filter + supportedSizes + free_only + invalid_size 消息）
- F-RB-03: DX-POLISH 回溯（chat modality reject + capability=vision + reasoning_tokens + json_mode 剥离 + not-found 措辞）
- F-RB-04: BL-073 邮箱验证路径（register → verify → login + 错误场景）
- F-RB-05: scripts/test-all.sh 统一入口 + env 读取一致化
- F-RB-06: codex 验收（含 mutation test 证明断言非空壳）
- 合并 backlog：BL-120（完全）+ BL-073（部分）

## 生产状态
- 所有代码已部署到 67889a0（ADMIN-OPS++ 签收版本）
- PM2 online，重启于 17:34 UTC+8
- PendingClassification 表已创建，等真实流量填充

## 遗留（不阻塞）
- templates/page.tsx:281 / 子路由（3 个 [id] 路由）/ admin/model-aliases text-[10px] / admin/models 搜索框 bg-lowest
- ADMIN-OPS++ reassign popover UI / 前端轮询统一端点

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
- 20260415 全量审计回归基线
