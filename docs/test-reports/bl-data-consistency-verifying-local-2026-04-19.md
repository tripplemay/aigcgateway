# BL-DATA-CONSISTENCY 本地验收报告（verifying）

- 批次：`BL-DATA-CONSISTENCY`
- 日期：`2026-04-19`
- 环境：L1 本地（`http://localhost:3099`）+ 生产只读 SSH 预检
- 执行者：Codex / Reviewer

## 结果摘要

- 16 项执行：`16 PASS / 0 FAIL`
- 结论：满足 `F-DC-04` 验收口径，可签收

## 验收明细

| 项 | 验收点 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | migration 可执行（deploy + status） | PASS | 56 migrations, no pending |
| 2 | `template_steps_actionId_idx` | PASS | `pg_indexes` 命中 |
| 3 | alias_model_links 双单列索引 | PASS | `aliasId_idx/modelId_idx` 命中 |
| 4 | email token FK cascade | PASS | `confdeltype='c'` |
| 5 | notifications `expiresAt` + idx | PASS | 列与索引均存在 |
| 6 | 删除 user 级联删 token | PASS | 删除后 token count=0 |
| 7 | `expiresAt=null` 保留 | PASS | null 行保留（seeded row） |
| 8 | BALANCE_LOW 默认 `expiresAt` | PASS | 新通知 `expiresAt` 非空 |
| 9 | latest 分页 LIMIT 5 | PASS | EXPLAIN 含 `Limit ... 5` |
| 10 | `npm run build` | PASS | 构建完成 |
| 11 | `npx tsc --noEmit` | PASS | 无类型错误 |
| 12 | `npx vitest run` | PASS | `134/134` |
| 13 | 登录 + notifications 能力 | PASS | `/api/notifications` 200 |
| 14 | MCP `list_public_templates` 分页 | PASS | `/mcp` `pageSize=5` |
| 15 | 生产只读 `template_steps` COUNT | PASS | `45` |
| 16 | 生产只读 `notifications` COUNT | PASS | `0` |

## 关键证据

- 自动化证据 JSON：
  - `docs/test-reports/perf-raw/bl-data-consistency-verifying-evidence-2026-04-19.json`
- 测试用例：
  - `docs/test-cases/bl-data-consistency-verifying-cases-2026-04-19.md`

## 风险与备注

- 本轮未发现阻断项。
- 第 15/16 项为生产只读查询，使用服务器 `.env.production` 的 DB 连接进行基线计数。
