---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- P5-public-templates：`fixing`（reverifying 未通过，等待 Generator 再修复）
- spec：`docs/specs/P5-public-templates-spec.md`
- 用例：`docs/test-cases/p5-public-templates-verifying-e2e-2026-04-09.md`
- 最新复验报告：`docs/test-reports/p5-public-templates-reverifying-2026-04-09.md`

## 本轮复验结论（2026-04-09）
- 通过：6 项（含 DS token 审计）
- 失败：1 项（i18n 审计）
- 关键证据：`hardcoded=detail-drawer.mode-suffix`
- 定位：`src/app/(console)/templates/template-detail-drawer.tsx` 中 `Mode` 后缀硬编码

## UI 重构进度
- 已完成并签收：R1 / R2A / R2B / R2C / R3A / R3B / R3C / R4
- 当前进行中：P5（公共模板库）

## 已知遗留
- P5 未达到 signoff 条件（`docs.signoff=null`）
- 待 Generator 修复 F-P5-06 后再次复验 F-P5-07
