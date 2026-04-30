# Bugfix Template API Reverification — 2026-04-08

## 环境
- Codex L1 stack (`bash scripts/test/codex-setup.sh`) @ http://localhost:3099
- Test DB: `postgresql://test:test@localhost:5432/aigc_gateway_test`
- 账户：`codex-admin@aigc-gateway.local` / `Codex@2026!`

## 测试资产
1. `npx tsx scripts/test/_archive_2026Q1Q2/bugfix-template-api-e2e-2026-04-08.ts`
   - 新增 action 引用后，验证：
     - 正常创建多步骤 Template (`create baseline template`)
     - 缺失 order/重复 order 进入 400（REST 层）
     - MCP `create_template` 输入缺少 action_id → `isError=true`（结构化错误）
   - 结果：`docs/test-reports/bugfix-template-api-e2e-2026-04-08.json`
2. `bash -lc 'source scripts/test/codex-env.sh && BASE_URL=http://localhost:3099 npx tsx scripts/test/_archive_2026Q1Q2/p4-action-template-e2e-2026-04-05.ts'`
   - 自动启动 mock provider（SSE）、设定用户余额、串行 + Fan-out Template 运行、MCP run_action/run_template、call_log & trace 校验。
   - 最新跑次输出：`docs/test-reports/p4-action-template-e2e-2026-04-08.json`
3. 手工 API/MCP 验证
   - REST 列表：`GET /api/projects/cmnp9veg.../templates`
   - MCP 成功创建：`tools/call:create_template`（Accept: `application/json, text/event-stream`）
   - 删除流程：`DELETE /api/projects/.../templates/{id}` + `GET` 返回 404。

## 结果概览
| 测试项 | 结论 | 证据 |
| --- | --- | --- |
| REST 创建模板含多步骤 | ✅ 201 + 返回模板 ID | Report JSON `create baseline template`
| REST 缺失 order / order 重复 | ✅ 返回 400 `invalid_parameter` | Report JSON (BTA cases)
| MCP create_template 错误分支 | ✅ `isError=true` + 校验信息 | Report JSON `mcp create_template error`
| MCP create_template 成功 | ✅ 返回 `template_id=cmnpa4y6x...` | `curl /mcp` 输出截取
| run_template (API Key) | ✅ SSE 顺序步骤 & steps[] 明细 | `p4-action-template-e2e-2026-04-08.json`
| run_template (MCP) | ✅ `executionMode=sequential` + output | 同上文件 `mcp run_template`
| Template 列表 UI 数据 | ✅ `names: ["MCP Positive", "Codex Template"]` | `curl /api/projects/.../templates`
| Delete 级联清理 steps | ✅ DELETE 200 + 同 ID GET 返回 404 | `curl -X DELETE ...` + follow-up GET

## 结论
- F-BT-01/02 回归正常；F-BT-03（E2E 验证）覆盖了 REST + MCP + run_template + 列表 + 删除，均通过。
- 复验结果：**PASS（0 FAIL / 0 PARTIAL）**。
