# AUDIT-SEC Verifying Report (L1 Local)

- Date: 2026-04-13
- Environment: `http://localhost:3099` (Codex harness, PTY foreground)
- Script: `scripts/test/_archive_2026Q1Q2/audit-sec-verifying-e2e-2026-04-13.ts`
- Raw evidence: `docs/test-reports/audit-sec-verifying-local-e2e-2026-04-13.json`

## Summary
- Result: **FAIL** (9 PASS / 1 FAIL)
- Conclusion: move to `fixing`

## Passed Checks
- `F-AS-01` upstream error sanitization: REST + MCP both no QQ/WeChat/internal terms/URL/API key leakage
- `F-AS-02` unavailable model filtering: all-disabled/all-health-fail aliases not returned
- `F-AS-03` image `supportedSizes` present on `list_models(modality=image)`
- `F-AS-04` image billing no longer $0: `get_log_detail.cost=$0.50000000`, balance deducted
- `F-AS-06` log detail prompt/response XSS escaping effective (`<script>` escaped)
- `F-AS-07` invalid size precheck: REST + MCP both return `invalid_size` and include supported size list

## Failed Check
- `F-AS-05` free_only filter logic
  - Acceptance: `list_models(free_only=true)` should include all free models (`perCall=0` included), and MCP/REST behavior must be consistent.
  - Repro fixture:
    - Seed image alias `auditsec_free_alias_*`
    - Alias sellPrice: `{ unit: "call", perCall: 0 }`
    - Channel sellPrice: `{ unit: "call", perCall: 0 }`
  - Actual:
    - REST `/api/v1/models?modality=image&free_only=true`: alias missing
    - MCP `list_models({ modality:"image", free_only:true })`: alias missing
  - Expected:
    - Alias must appear in both REST and MCP free_only results.
  - Evidence snippet:
    - `free alias missing: rest=false mcp=false alias=auditsec_free_alias_1776041503798_75w2td`

## Risk
- Free models with `perCall=0` are undiscoverable through `free_only=true`, causing pricing-discovery inconsistency and DX regression.

## Next Action
- Generator should fix `free_only` filter to include image pricing `perCall=0` path (and keep MCP/REST parity), then request `reverifying`.
