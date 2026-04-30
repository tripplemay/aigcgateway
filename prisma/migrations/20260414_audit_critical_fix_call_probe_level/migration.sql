-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- AUDIT-CRITICAL-FIX F-ACF-10 — add CALL_PROBE level to HealthCheckLevel enum.
-- CALL_PROBE runs a minimum-cost real chat (or generate_image) probe on a
-- cadence and auto-disables channels that fail three consecutive probes.

ALTER TYPE "HealthCheckLevel" ADD VALUE IF NOT EXISTS 'CALL_PROBE';
