/*
  Warnings:

  - You are about to drop the column `search_vector` on the `call_logs` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_call_logs_search";

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "description" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "ipWhitelist" JSONB,
ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rateLimit" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "call_logs" DROP COLUMN "search_vector",
ALTER COLUMN "source" SET DATA TYPE TEXT;

-- RenameIndex
ALTER INDEX "idx_call_logs_source" RENAME TO "call_logs_source_idx";
