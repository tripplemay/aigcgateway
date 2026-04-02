-- DropIndex: search_vector GIN index (no longer used)
DROP INDEX IF EXISTS "idx_call_logs_search";

-- Drop search_vector trigger and function (must be before column drop)
DROP TRIGGER IF EXISTS call_logs_search_trigger ON call_logs;
DROP FUNCTION IF EXISTS call_logs_search_update();

-- AlterTable: remove search_vector column, normalize source column type
ALTER TABLE "call_logs" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "call_logs" ALTER COLUMN "source" SET DATA TYPE TEXT;

-- RenameIndex: align with Prisma naming convention
ALTER INDEX IF EXISTS "idx_call_logs_source" RENAME TO "call_logs_source_idx";
