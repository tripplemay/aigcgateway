# Security And Robustness Verifying Report — 2026-04-08

## Environment
- Stage: L1 (localhost)
- Base URL: `http://localhost:3099`
- Setup: `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## Executed Artifacts
- Test case: `docs/test-cases/security-and-robustness-e2e-2026-04-08.md`
- Test script: `scripts/test/security-and-robustness-e2e-2026-04-08.ts`
- Evidence JSON: `docs/test-reports/security-and-robustness-e2e-2026-04-08.json`

## Result Summary
- PASS: 1
- FAIL: 3
- PARTIAL: 0

## Acceptance Check (F-SR-05)
1. AC1 chatCompletion=false 的 Key 调用 `/v1/actions/run` 返回 403: **FAIL**
2. AC2 MCP 非白名单 IP 调用被拒绝: **FAIL**
3. AC3 API Key 创建按钮请求中 disabled: **FAIL**
4. AC4 dashboard API 失败时不卡在 loading: **PASS**

## Failure Details

### AC1 FAIL
- Observed: 返回 `402 insufficient_balance`，不是预期的 `403 forbidden`。
- Evidence: `security-and-robustness-e2e-2026-04-08.json` 中 AC1 步骤。
- Impact: `/v1/actions/run` 仍可绕过 chatCompletion 权限检查，先进入余额逻辑。

### AC2 FAIL
- Observed: `ipWhitelist=["127.0.0.1"]` 的 Key，从非白名单 IP（`203.0.113.10`）调用 `/mcp` 仍返回 200。
- Evidence: `security-and-robustness-e2e-2026-04-08.json` 中 AC2 步骤。
- Impact: MCP 端点 IP 白名单约束未生效。

### AC3 FAIL
- Observed: Create API Key 请求进行中，按钮未进入 disabled 状态。
- Evidence: `security-and-robustness-e2e-2026-04-08.json` 中 AC3 步骤。
- Impact: 仍存在重复提交风险。

## Conclusion
- 当前批次回退 **fixing**。
- 建议 Generator 优先修复 AC1/AC2（安全性）后再处理 AC3（交互一致性），修复后进入 `reverifying`。
