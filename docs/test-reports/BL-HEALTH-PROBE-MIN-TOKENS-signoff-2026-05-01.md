# BL-HEALTH-PROBE-MIN-TOKENS Signoff

- Batch: `BL-HEALTH-PROBE-MIN-TOKENS`
- Evaluator: `Codex / Reviewer`
- Date: `2026-05-01 17:39:11 CST`
- Commit under test: `f262ec7`
- Conclusion: `PASS`

## Scope

- `F-HPMT-01`: raise health probe chat `max_tokens` floor from `1` to `16`
- `F-HPMT-02`: soft-disable deprecated OpenRouter model `~openai/gpt-latest`
- `F-HPMT-03`: Codex acceptance and signoff

## Environment

- Local L1 verification
- App booted with `bash scripts/test/codex-setup.sh`
- Readiness confirmed with `bash scripts/test/codex-wait.sh`
- App URL: `http://localhost:3199`
- Test PostgreSQL container host port: `65468`

## Results

### Harness PASS

- `bash scripts/test/codex-setup.sh`: PASS
- `bash scripts/test/codex-wait.sh`: PASS

### F-HPMT-01 PASS

- `src/lib/health/checker.ts` defines `PROBE_MAX_TOKENS = 16`
- Production references found in at least two paths:
  - `runCallProbe` chat branch
  - `runTextCheck`
- `rg -n "max_tokens:\\s*1" src/lib/health -S` found no production hardcoded `1`
- Residual `max_tokens: 1` exists only outside batch scope:
  - `src/lib/api/post-process.ts:216`
- `checker-lean.test.ts` covers:
  - `runHealthCheck` using `max_tokens=16`
  - `runCallProbe(TEXT)` using `max_tokens=16`

Evidence:

```text
src/lib/health/checker.ts:37:const PROBE_MAX_TOKENS = 16;
src/lib/health/checker.ts:92: *   else      → adapter.chatCompletions({max_tokens:PROBE_MAX_TOKENS})
src/lib/health/checker.ts:166:        max_tokens: PROBE_MAX_TOKENS,
src/lib/health/checker.ts:412:        max_tokens: PROBE_MAX_TOKENS,
```

### F-HPMT-02 PASS

- Verified `DRY_RUN=1` output lists the target model and channels and performs no writes
- Verified real run performs only soft-disable:
  - `model.enabled = false`
  - `channel.status = DISABLED`
- Verified audit data is preserved:
  - `health_checks` count unchanged
  - `call_logs` count unchanged
- Verified second real run is idempotent

Evidence:

```json
{
  "before": {
    "modelEnabled": true,
    "channels": [{ "id": "cmompynu800029yicaa2a9rtf", "status": "ACTIVE" }],
    "healthChecks": 1,
    "callLogs": 1
  },
  "afterDryRun": {
    "modelEnabled": true,
    "channels": [{ "id": "cmompynu800029yicaa2a9rtf", "status": "ACTIVE" }],
    "healthChecks": 1,
    "callLogs": 1
  },
  "afterApply": {
    "modelEnabled": false,
    "channels": [{ "id": "cmompynu800029yicaa2a9rtf", "status": "DISABLED" }],
    "healthChecks": 1,
    "callLogs": 1
  },
  "afterApplyAgain": {
    "modelEnabled": false,
    "channels": [{ "id": "cmompynu800029yicaa2a9rtf", "status": "DISABLED" }],
    "healthChecks": 1,
    "callLogs": 1
  }
}
```

Dry-run / apply output excerpts:

```text
[target] model="~openai/gpt-latest" id=cmompynu400009yics5zgjxqt enabled=true channels=1
           - channel id=cmompynu800029yicaa2a9rtf status=ACTIVE
[dry-run] no DB writes for model "~openai/gpt-latest"
...
[done] disabled model "~openai/gpt-latest" + 1 channel(s) (status=DISABLED)
```

### Regression PASS

- `npx tsc --noEmit`: PASS
- `npm run test`: PASS
  - `68 files / 550 passed / 4 skipped`
- `npm run build`: PASS
  - existing non-blocking ESLint warnings only

## Non-blocking Notes

- `src/lib/api/post-process.ts:216` still writes `requestParams.max_tokens: 1` into audit log payloads. This is outside the current batch scope and does not affect probe behavior, but it leaves audit metadata inconsistent with the new runtime value `16`.
- Production-side soft validation against real provider-backed `gpt-5` channels was not executed in this round because the local verification environment has no provider API keys configured.

## Signoff

- `F-HPMT-01`: accepted
- `F-HPMT-02`: accepted
- `F-HPMT-03`: accepted
- Recommended next status: `done`
