-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- BL-BILLING-AUDIT-EXT-P2 F-BAP2-02: 给 SystemLogCategory enum 加 BILLING_AUDIT，
-- reconcile-job 写 SystemLog 用此分类。

ALTER TYPE "SystemLogCategory" ADD VALUE IF NOT EXISTS 'BILLING_AUDIT';
