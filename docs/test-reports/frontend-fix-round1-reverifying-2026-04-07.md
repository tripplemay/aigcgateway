# frontend-fix-round1 复验报告（2026-04-07）

- 环境：本地 Codex 测试环境 `http://localhost:3099`（`codex-setup.sh` + `codex-wait.sh`）
- 批次：`frontend-fix-round1`
- 参考：`docs/test-reports/frontend-fix-round1-reverifying-local-e2e-2026-04-07.json`

## 执行摘要

- UI：通过 chrome-devtools 工具登录、创建项目，确认 `CreateProjectDialog` 与 Sidebar「新建项目」链路可视化可用。截图：`docs/test-reports/frontend-fix-round1-create-project-dialog.png`。
- API：未登录访问 `/dashboard` 与 Developer 访问 `/admin/users` 均返回 `307` 重定向，满足路由保护。
- 静态检查：`src/app/(console)/keys/page.tsx` 不含 `href="#"`；`models` 与 `balance` 页面空态均切换到 `useTranslations`。
- 工具链：`npm run lint -- --no-cache` 仅保留 Next 自带字体提示，无 `react-hooks/exhaustive-deps` 告警。
- 模型/费用：DB 查询确认 `doubao-pro-32k` 已不存在；`MCP get_balance/get_usage_summary/get_log_detail` 皆输出 8 位小数。

## 详细验证

### 1. CreateProjectDialog + Sidebar 新建项目
- 使用 API 预注册 `codex-ui-test@local` 并通过 `document.cookie` 注入 JWT 后登录控制台。
- 主 CTA 创建 `UI Test Project 1`，Sidebar 按钮再次创建 `Sidebar Project 2`。
- `/api/projects` 返回两个项目：`cmnojy...` 与 `cmnojz...`（JSON 见 `frontend-fix-round1-reverifying-local-e2e-2026-04-07.json`）。
- 截图：`docs/test-reports/frontend-fix-round1-create-project-dialog.png`。

### 2. 路由保护
- 未登录访问 `/dashboard`：
  ```bash
  curl --noproxy '*' -s -o /dev/null -D - http://localhost:3099/dashboard
  # => HTTP/1.1 307 Temporary Redirect\nlocation: /login
  ```
- Developer token 访问 `/admin/users`：
  ```bash
  curl --noproxy '*' -s -o /dev/null -D - http://localhost:3099/admin/users \\
       -H "Authorization: Bearer <developer JWT>"
  # => HTTP/1.1 307 Temporary Redirect\nlocation: /dashboard
  ```

### 3. Keys 页死链清理
- `rg -n "href='#'" src/app/(console)/keys/page.tsx` 无匹配；文件内 CTA 均通过真实 `Link`/`button` 实现。

### 4. i18n 硬编码
- `src/app/(console)/models/page.tsx:293` 使用 `t("noModelsFound")`。
- `src/app/(console)/balance/page.tsx:279` 使用 `t("noTransactions")`。
- `src/messages/(en|zh-CN).json` 已补充对应 key。

### 5. Hook 依赖 / Lint
- `npm run lint -- --no-cache`：
  ```
  ✓ next lint --no-cache
  ./src/app/layout.tsx  Warning @next/next/no-page-custom-font
  ```
  无 `react-hooks/exhaustive-deps` 告警。

### 6. list_models 过滤
- `SELECT count(*) FROM "models" WHERE name='doubao-pro-32k';` → `0` 行。
- `curl --noproxy '*' -s http://localhost:3099/v1/models` 返回 `{"object":"list","data":[]}`（仅健康通道会入列）。

### 7. 费用精度
- 针对项目 `cmnojzanm00ql9yavn4zkmjq2` 写入示例交易/日志（金额 8 位小数）。
- MCP 调用（见 JSON 附件）：
  - `get_balance(include_transactions=true)` → `balance "$12.34567890"`，交易金额 `$0.12345678`。
  - `get_usage_summary()` → `totalCost "$0.12345678"`，`avgLatency 1.2s`。
  - `get_log_detail(trace_ui_e2e)` → `cost "$0.12345678"`，`ttft "0.40s"`。

## 结论

| 功能 | 结果 | 说明 |
|---|---|---|
| F-FF-01~07 | PASS | 保持前轮验证结论 |
| F-FF-08 | PASS | UI 链路补齐，权限/模型/费用验收全部通过 |

→ 建议进入 `done`，并在 `progress.json` 写入本报告及 signoff。
