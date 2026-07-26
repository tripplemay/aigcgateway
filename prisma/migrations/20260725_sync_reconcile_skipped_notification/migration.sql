-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- BL-DEEPSEEK-V4-HOTFIX F-DSV4-03 — NotificationEventType 增加 SYNC_RECONCILE_SKIPPED
--
-- 背景：model-sync 的缩水护栏（远端模型数 < 现存通道数 50%）拦下 reconcile 时
-- 只 console.log，无 SystemLog、无通知。DeepSeek 直连下线 deepseek-chat /
-- deepseek-reasoner 后该护栏连续 5 天静默命中，陈旧通道未被自动下架，直到
-- 用户报障才被发现。新增事件类型用于把这类"需要人介入"的拦截推给管理员。

-- AlterEnum
ALTER TYPE "NotificationEventType" ADD VALUE 'SYNC_RECONCILE_SKIPPED';
