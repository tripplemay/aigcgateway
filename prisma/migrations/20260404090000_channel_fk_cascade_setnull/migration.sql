-- DropForeignKey
ALTER TABLE "call_logs" DROP CONSTRAINT "call_logs_channelId_fkey";

-- DropForeignKey
ALTER TABLE "health_checks" DROP CONSTRAINT "health_checks_channelId_fkey";

-- AlterTable: make channelId nullable (SetNull requires nullable column)
ALTER TABLE "call_logs" ALTER COLUMN "channelId" DROP NOT NULL;

-- AddForeignKey: call_logs → channels (SetNull on delete)
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: health_checks → channels (Cascade on delete)
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
