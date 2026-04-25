warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- DropForeignKey
ALTER TABLE "call_logs" DROP CONSTRAINT "call_logs_projectId_fkey";

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

