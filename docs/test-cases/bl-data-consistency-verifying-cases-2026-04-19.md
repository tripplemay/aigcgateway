# BL-DATA-CONSISTENCY 验收用例（verifying）

- 批次：`BL-DATA-CONSISTENCY`
- 阶段：`verifying`
- 目标功能：`F-DC-04`（`executor: codex`）
- 环境：L1 本地 `http://localhost:3099`（生产预检只读）

## 前置条件

1. 已同步主分支：`git pull --ff-only origin main`
2. 本地测试服务按规范启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
3. 测试数据库：`aigc_gateway_test`

## 验收矩阵（17 项）

1. `npx prisma migrate dev` 本地跑通
2. `template_steps` 存在 `template_steps_actionId_idx`
3. `alias_model_links` 存在 `alias_model_links_aliasId_idx` 与 `alias_model_links_modelId_idx`
4. `email_verification_tokens` 的 `userId` FK 含 `ON DELETE CASCADE`
5. `notifications` 存在 `expiresAt` 字段与 `notifications_expiresAt_idx`
6. 删除测试用户后，其 `EmailVerificationToken` 被级联删除
7. 存量 `notifications.expiresAt IS NULL` 数据保留（数量 >= 1）
8. 新建 `BALANCE_LOW` 通知默认写入 `expiresAt`（非 null）
9. public templates latest 分页路径可验证 `LIMIT 5`（SQL EXPLAIN）
10. `npm run build` 通过
11. `npx tsc --noEmit` 通过
12. `npx vitest run` 通过
13. 登录后通知能力正常（`/api/notifications` 返回 200，且 dashboard 通知入口存在）
14. MCP `list_public_templates` 分页返回正常（`initialize` + `tools/call`）
15. 生产只读预检：`template_steps` 行数基线
16. 生产只读预检：`notifications` 行数基线
17. 生成签收报告并写入 `progress.json.docs.signoff`

## 证据要求

1. 命令输出：migrate/build/tsc/vitest
2. 数据库证据：索引、约束、列、级联删除、expiresAt
3. MCP 证据：`initialize` 与 `list_public_templates`
4. 生产只读证据：两条 `COUNT(*)`（若无访问权限，必须明确 BLOCKED 原因）
