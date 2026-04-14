-- RATE-LIMIT F-RL-07 — add RATE_LIMIT category to SystemLogCategory enum.

ALTER TYPE "SystemLogCategory" ADD VALUE IF NOT EXISTS 'RATE_LIMIT';
