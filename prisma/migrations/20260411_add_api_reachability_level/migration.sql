-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- AlterEnum
ALTER TYPE "HealthCheckLevel" ADD VALUE 'API_REACHABILITY' BEFORE 'CONNECTIVITY';
