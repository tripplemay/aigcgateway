-- BL-BILLING-AUDIT-EXT-P1 F-BAX-01:
-- 让 call_logs.projectId 可空，用于 probe / sync / admin_health 等系统路径，
-- 这些场景没有归属 project，但仍需写入 call_logs 做统一审计。
-- source 字段保持 String 类型；运行时扩展到接受 'probe' | 'sync' | 'admin_health'。

ALTER TABLE "call_logs" ALTER COLUMN "projectId" DROP NOT NULL;
