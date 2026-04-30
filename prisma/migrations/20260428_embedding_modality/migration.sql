-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- BL-EMBEDDING-MVP F-EM-01 — ModelModality EMBEDDING + Action.modality field
--
-- 拆分约束：PostgreSQL 不允许在同一事务里 ADD VALUE 然后立刻 USE VALUE。
-- 这里 ADD VALUE 'EMBEDDING'，但 ALTER TABLE 用的是 existing 'TEXT' 默认值，
-- 因此可以放在同一 migration 文件（两条独立 statement）。

-- AlterEnum
ALTER TYPE "ModelModality" ADD VALUE 'EMBEDDING';

-- AlterTable
ALTER TABLE "actions" ADD COLUMN "modality" "ModelModality" NOT NULL DEFAULT 'TEXT';
