# M1a Alias Backend Verifying E2E (2026-04-09)

## Scope
- Batch: `M1a-alias-backend-core`
- Feature: `F-M1a-06` (`executor: codex`)
- Env: L1 local (`http://localhost:3099`)

## Acceptance Mapping
1. Admin 创建别名并挂载模型后，`GET /v1/models` 可见该别名。
2. 用户使用别名调用 `POST /v1/chat/completions` 成功路由。
3. 不存在别名调用返回 `404`。
4. `Model.enabled` 在挂载后自动为 `true`。
5. MCP `list_models` 和 `chat` 在别名模式下正常。
6. 解绑后（无其它别名关联）`Model.enabled` 自动为 `false`。

## Execution Method
- Script: `scripts/test/_archive_2026Q1Q2/m1a-alias-backend-verifying-e2e-2026-04-09.ts`
- Command:

```bash
npx tsx scripts/test/_archive_2026Q1Q2/m1a-alias-backend-verifying-e2e-2026-04-09.ts
```

## Notes
- 脚本内置本地 mock provider（仅用于路由可控验证）。
- 测试数据为临时别名/用户/项目/API Key，不改动产品实现代码。
