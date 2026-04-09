-- AlterTable
ALTER TABLE "model_aliases" ADD COLUMN     "sellPrice" JSONB,
ALTER COLUMN "updatedAt" DROP DEFAULT;
