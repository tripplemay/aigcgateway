# R1 设计系统基础对齐 E2E 用例（2026-04-08）

## 测试目标
验证 F-R1-13：基础组件 + Dashboard 视觉回归。

## 测试环境
- 本地 Codex 测试环境：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 账号：`admin@aigc-gateway.local`

## 测试范围与用例
1. 登录后进入 Dashboard，页面可加载。
2. Dashboard 打开后检查 console 是否有 error。
3. Sidebar active 样式检查：不允许 `border-l-4`，应为 accent pill（`before:*`）。
4. SearchBar / Pagination 可 import 且 render（脚本）。
5. 组件样式基线检查（Button/Input/Card/Dialog/Table）使用 design token，无回退旧分割线样式。

## 通过标准
- AC1~AC5 全部通过；若有非阻断 issue，需在报告中记录并标注风险等级。
