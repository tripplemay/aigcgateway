-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- BL-BILLING-AUDIT-EXT-P1 F-BAX-05:
-- 新增 AUTH_ALERT 事件类型，用于 channel 连续 auth_failed（余额不足 /
-- ApiKey 错误）自动提醒管理员。dedup 24h 防重复告警。

ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'AUTH_ALERT';
