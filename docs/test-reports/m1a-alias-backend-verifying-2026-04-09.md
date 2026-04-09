# M1a Alias Backend Verifying Report (2026-04-09)

## Scope
- Batch: `M1a-alias-backend-core`
- Feature: `F-M1a-06` (`executor: codex`)
- Env: L1 local (`http://localhost:3099`)
- Script: `scripts/test/m1a-alias-backend-verifying-e2e-2026-04-09.ts`

## Result
- Pass: `6`
- Fail: `0`
- Raw evidence: `docs/test-reports/m1a-alias-backend-verifying-e2e-2026-04-09.json`

## Acceptance Checks
1. AC1 PASS: Admin 创建别名并挂载后，`/v1/models` 返回该别名，且无 `provider_name`。
2. AC2 PASS: 别名调用 `/v1/chat/completions` 成功，返回 mock 路由内容。
3. AC3 PASS: 不存在别名调用返回 `404`（`model_not_found`）。
4. AC4 PASS: 挂载后 `Model.enabled=true`。
5. AC5 PASS: MCP `list_models` 能看到别名，`chat` 可用且非 `isError`。
6. AC6 PASS: 解绑后（无别名关联）`Model.enabled=false`。

## Conclusion
`F-M1a-06` 验收通过，满足本轮 `verifying` 目标，可签收并推进 `done`。
