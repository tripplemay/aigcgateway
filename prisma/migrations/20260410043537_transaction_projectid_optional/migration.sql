-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP CONSTRAINT for new constraints; ALTER COLUMN must be reversed manually)
-- Transaction.projectId: required → optional
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_projectId_fkey";
ALTER TABLE "transactions" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
