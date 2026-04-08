# Bugfix Template API — Production Verification (2026-04-08)

## 环境
- Base URL: https://aigc.guangai.ai (PRODUCTION_STAGE=RND)
- 账号：`codex-prod-template-20260408@aigc-gateway.local`（新注册，仅此轮验收使用）
- Admin Token：`codex-admin@aigc-gateway.local`（仅用于余额充值 API）

## 执行步骤
1. **API E2E（脚本）** — `node scripts/test/ad-hoc (inline)`
   - 登陆 → 创建独立 Project → 创建 Actions（deepseek/v3） → 创建模板 → 验证缺失/重复 order 400 → 生成 API Key → MCP `create_template` 错误分支。
   - 输出：`docs/test-reports/bugfix-template-api-production-e2e-2026-04-08.json`
2. **Admin 手动充值** — `POST /api/admin/users/:id/projects/:projectId/recharge`，充值 $20 以便 run_template。
3. **MCP 正向创建** — `tools/call:create_template`，Accept= `application/json, text/event-stream`。
   - 证据：`docs/test-reports/bugfix-template-api-production-mcp-2026-04-08.txt`
4. **API run_template** — `POST /v1/templates/run`（非流式），返回 `steps[]` 细节。
   - 证据：`docs/test-reports/bugfix-template-api-production-run-template-2026-04-08.txt`
5. **Template 列表** — `GET /api/projects/:id/templates`，含新建的两个模板。
   - 证据：`docs/test-reports/bugfix-template-api-production-list-2026-04-08.json`
6. **删除校验** — `DELETE /api/projects/:id/templates/:templateId` → `GET` 返回 404。
   - 证据：`docs/test-reports/bugfix-template-api-production-delete-check-2026-04-08.txt`

## 结果
| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| REST 创建模板（多步骤） | ✅ 201，模板 ID `cmnpace0q000dbn42fdi61v5e` | prod e2e JSON `create template` 步骤 |
| REST 验证缺失/重复 order | ✅ 400 `invalid_parameter` | prod e2e JSON `missing/duplicate` steps |
| MCP create_template 错误 | ✅ `isError=true` | prod e2e JSON `mcp create_template error` |
| MCP create_template 成功 | ✅ `template_id=cmnpadaus0001bn41gs3m59df` | production-mcp TXT |
| run_template（API Key） | ✅ `total_steps=2` + step outputs | production-run-template TXT |
| Template 列表 | ✅ 两条记录（Codex Prod Template & Prod MCP Positive） | production-list JSON |
| 删除模板级联清理 | ✅ DELETE 200 + GET 404 | production-delete-check TXT |

## 备注
- 生产环境余额为 User 级别；需通过 Admin recharge API 增加余额，否则 `/v1/templates/run` 返回 `insufficient_balance`。
- 执行完成后已删除所有临时模板，避免污染生产数据。
