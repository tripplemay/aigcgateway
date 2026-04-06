-- AlterTable: add isPublic and qualityScore to templates
ALTER TABLE "templates" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "templates" ADD COLUMN "qualityScore" INTEGER;
