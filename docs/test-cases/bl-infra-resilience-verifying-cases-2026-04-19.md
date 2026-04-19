# BL-INFRA-RESILIENCE Verifying Cases (2026-04-19)

## Scope
- Sprint: `BL-INFRA-RESILIENCE`
- Stage: `verifying`
- Env: L1 local (`localhost:3099`), plus production smoke if credentials available.

## Acceptance Mapping
1. `fetchWithTimeout` unit tests pass.
2. Dispatcher webhook hang triggers ~10s timeout path.
3. Health alert webhook hang triggers ~10s timeout path.
4. OpenAI compat stream keeps timeout active after headers and aborts hanging body.
5. Chat stream error path calls `reader.cancel`.
6. Stream cancel path propagates cancel to upstream reader (with failover scenario covered by code path + probe).
7. `rpmCheck` concurrent limit=5 yields 5 ok / 5 over.
8. Redis Lua eval smoke on production (if executable).
9. Reconcile batch contract indicates bounded DB round-trips.
10. `list-actions` versions include `take: 10`.
11. `post-process` project query de-dup validated by code path evidence.
12. `npm run build` pass.
13. `npx tsc --noEmit` pass.
14. `npx vitest run` full pass.
15. Produce signoff report.

## Execution Plan
- Boot service by `scripts/test/codex-setup.sh` + `scripts/test/codex-wait.sh`.
- Run targeted suites for #1/#7/#9/#10.
- Run dynamic probe script for #2/#3/#4/#6.
- Verify #5/#11 via code-path evidence + probe logs.
- Run full quality gates (#12/#13/#14).
- Generate verifying/signoff output.
