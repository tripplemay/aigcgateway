---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- R4-design-restoration：`fixing`（verifying 未通过，等待 Generator 修复）
- spec：`docs/specs/R4-design-restoration-spec.md`
- 最新用例：`docs/test-cases/r4-design-restoration-verifying-e2e-2026-04-09.md`
- 最新报告：`docs/test-reports/r4-design-restoration-verifying-2026-04-09.md`

## 本轮验收结论（2026-04-09）
- 通过：3 项（smoke、页面可加载、结构抽检）
- 失败：2 项（DS 颜色规范、i18n 残留）
- 关键证据：`hardcodedColor=35`，`legacy=0`
- i18n 残留点：`auth-terminal.stream-line`、`auth-terminal.command`、`mcp.tool-desc`

## UI 重构进度
- 已完成并通过：R1 / R2A / R2B / R2C / R3A / R3B / R3C
- R4：待修复后进入 `reverifying`

## 已知遗留
- 白名单页与模板页仍有硬编码颜色类
- MCP Setup 与 AuthTerminal 存在硬编码英文与色值
- 需 Generator 修复后由 Evaluator 复验并出 signoff
