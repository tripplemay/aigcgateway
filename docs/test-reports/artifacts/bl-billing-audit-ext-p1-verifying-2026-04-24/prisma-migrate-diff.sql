-- DropForeignKey
ALTER TABLE "call_logs" DROP CONSTRAINT "call_logs_projectId_fkey";

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

