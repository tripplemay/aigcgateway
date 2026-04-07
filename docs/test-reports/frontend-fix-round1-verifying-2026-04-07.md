# frontend-fix-round1 验收报告（verifying）

- 日期：2026-04-07
- 环境：本地测试环境 `http://localhost:3099`（按 `scripts/test/codex-setup.sh` + `scripts/test/codex-wait.sh` 启动）
- 批次：`frontend-fix-round1`
- 目标：验证 F-FF-01 ~ F-FF-08（其中 F-FF-08 为 codex 执行）

## 执行摘要

- 代码层复核：F-FF-01 ~ F-FF-07 相关修复点均已落地。
- 运行时验证：完成 API/MCP 精度与模型过滤、权限拦截、lint 复验。
- 阻塞项：浏览器自动化工具 `chrome-devtools` 当前不可用（Transport closed），导致部分 UI 交互仅完成代码层验证，未形成浏览器点击证据。

## 通过项

1. F-FF-02（部分）未登录与权限拦截
   - 未登录访问 `/dashboard` 返回 `307 /login`（Node fetch redirect=manual）。
   - Developer 访问 `/admin/users` 被拦截（`307`）。
2. F-FF-03 Keys 页死链
   - `src/app/(console)/keys/page.tsx` 未发现 `href="#"`。
3. F-FF-04 i18n
   - `models/page.tsx` 使用 `t("noModelsFound")`；`balance/page.tsx` 使用 `t("noTransactions")`。
   - `src/messages/en.json` 与 `src/messages/zh-CN.json` 存在对应 key。
4. F-FF-05 Hook 依赖
   - `npm run lint -- --no-cache` 无 `react-hooks/exhaustive-deps` 警告。
5. F-FF-06/F-FF-07（运行时）
   - 证据文件：`docs/test-reports/frontend-fix-round1-verifying-local-e2e-2026-04-07.json`
   - `/api/v1/models` 与 MCP `list_models` 均不含 `doubao-pro-32k`。
   - MCP `get_balance/get_usage_summary/get_log_detail` 均输出 8 位小数格式。

## 未完成项（导致 F-FF-08 PARTIAL）

1. F-FF-01/F-FF-08 的纯前端交互链路未完成浏览器级点击验证：
   - CreateProjectDialog 点击打开与提交创建（UI 交互）
   - Sidebar New Project 按钮点击可用性（UI 交互）
2. 失败原因：本轮环境中 `chrome-devtools` MCP 工具不可用（Transport closed）。

## 风险项

- 目前 F-FF-08 仅“后端/API/MCP + 代码层”通过，缺少浏览器交互证据，不能判定为全量 PASS。

## 结论

- F-FF-01 ~ F-FF-07：通过。
- F-FF-08：**PARTIAL**（缺浏览器交互证据，需补跑 UI E2E）。
- 建议状态流转：`verifying -> fixing`（由 Generator/Codex 在浏览器工具恢复后补齐 UI 证据）。
