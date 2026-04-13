-- AUDIT-CRITICAL-FIX F-ACF-01 — add responseSummary JSON column to CallLog.
-- Holds per-call structured metadata such as images_count for image requests
-- and zero_image_delivery markers that the refund audit script filters on.

ALTER TABLE "call_logs" ADD COLUMN "responseSummary" JSONB;
