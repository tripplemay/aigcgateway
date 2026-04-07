Summary
- Scope: bugfix-template-api batch (F-BT-01~03) verifying Template REST + MCP endpoints after step validation & error handling fix.
- Environment: Codex stack (`bash scripts/test/codex-setup.sh`) @ http://localhost:3099
- Result totals: 待执行

Scenario Coverage
- Scenario A – REST POST /api/projects/:id/templates step validation + graceful errors
- Scenario B – REST PUT /api/projects/:id/templates/:templateId order uniqueness enforcement
- Scenario C – MCP create_template/update_template/delete_template tools returning structured errors

Test Cases

ID: BTA-L1-01
Title: REST create template fails with missing step order
Priority: Critical
Steps:
1. 登录获取 token，构造 steps 数组缺少 order。
2. POST `/api/projects/:id/templates`
Expected:
- 返回 400 JSON 描述 `step order is required`（无 500）。

ID: BTA-L1-02
Title: REST update template enforces unique order
Priority: High
Steps:
1. 创建含 step order=1 的模板。
2. PUT 同模板，提交 steps 两个 order=1。
Expected:
- 返回 400/409，提示 order must be unique；原模板未变。

ID: BTA-L1-03
Title: MCP create_template surface validation error
Priority: High
Steps:
1. 调用 MCP `create_template`，steps 缺少 actionId 或 order。
Expected:
- 返回 `isError=true` / internal_error message，非 500。
