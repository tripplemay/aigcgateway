# M1a-alias-backend-core Signoff 2026-04-09

> 状态：**Evaluator 签收通过**
> 触发：`F-M1a-06` 在本轮 verifying 中 AC1~AC6 全部通过。

---

## 变更背景

M1a 目标是将模型别名升级为后端一等公民：路由按别名解析、`/v1/models` 返回别名、Admin 支持别名挂载模型、MCP 工具按别名工作。

---

## 验收范围

1. `F-M1a-01` Schema 迁移（ModelAlias 升级 + AliasModelLink）。
2. `F-M1a-02` Admin 别名 CRUD + link/unlink（含 Model.enabled 派生）。
3. `F-M1a-03` 路由引擎 `routeByAlias`。
4. `F-M1a-04` `GET /v1/models` 返回别名列表。
5. `F-M1a-05` MCP tools 别名适配。
6. `F-M1a-06` 全量验收执行。

---

## 验收证据

- 测试用例：`docs/test-cases/m1a-alias-backend-verifying-e2e-2026-04-09.md`
- 自动化脚本：`scripts/test/_archive_2026Q1Q2/m1a-alias-backend-verifying-e2e-2026-04-09.ts`
- 执行结果（JSON）：`docs/test-reports/m1a-alias-backend-verifying-e2e-2026-04-09.json`
- 执行报告（MD）：`docs/test-reports/m1a-alias-backend-verifying-2026-04-09.md`

---

## 最终结论

M1a 当前满足签收标准：
- Admin 创建别名并挂载模型后，`/v1/models` 可见别名且无 provider 泄露。
- 别名调用 `/v1/chat/completions` 成功；不存在别名返回 404。
- `Model.enabled` 在 link/unlink 时自动派生变化。
- MCP `list_models` 与 `chat` 均按别名模式正常工作。

可以将 `progress.json` 更新为 `done`，并将本报告登记到 `docs.signoff`。
