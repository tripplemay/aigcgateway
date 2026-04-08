# Full Chain Dynamic Test Report — 2026-04-08

- Base: https://aigc.guangai.ai
- Test account: codex-fullchain-1775613238382@test.local
- Project: cmnpea1au00ibbntbk19b05a5
- Started: 2026-04-08T01:53:58.381Z
- Finished: 2026-04-08T01:54:06.319Z

## Summary
- Total steps: 34
- Non-2xx / failed expectations: 7

## Key Findings (Dynamic)
1. Restricted key can reach /v1/actions/run and /v1/templates/run up to balance check (permission not blocked first).
2. IP-whitelist key blocked on REST /v1/chat but allowed on /api/mcp initialize.
3. Forged alipay webhook returns success; transaction/recharge record updated while project balance endpoint remained unchanged.

## Evidence
- JSON details: `docs/test-reports/full-chain-dynamic-2026-04-08.json`