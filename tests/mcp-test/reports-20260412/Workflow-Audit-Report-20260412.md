# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：Workflow-Audit
---

---

### Audit Complete — Summary

| ID | Severity | Issue |
|---|---|---|
| **DX-001** | CRITICAL | Sequential template `{{previous_output}}` silently overridden by same-name caller variable — step chaining broken |
| **DX-002** | HIGH | `deepseek-v3` listed in catalog but runtime returns `model_not_found` |
| **DX-003** | MEDIUM | No per-step variable scoping in `run_template` — flat namespace forces collision |
| **DX-004** | MEDIUM | No warning when variable names collide with `{{previous_output}}` injection |
| **DX-005** | LOW | Price fields show 16-digit unrounded decimals |
| **DX-006** | LOW | IEEE 754 floating-point artifact in `minimax-m2.5` price |

**Positive highlights**: Version rollback (`activate_version`) is instant and reliable. `dry_run` is a standout DX feature. `run_template` step-level observability (input/output/usage/latency per step) is excellent. Test data cleanup (delete) worked cleanly with referential integrity checks.
