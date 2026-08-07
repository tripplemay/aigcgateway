-- ROLLBACK: DELETE FROM notification_preferences WHERE "createdAt" >= '<迁移执行时刻>';
--            （本迁移只新增缺失行、从不修改既有行，故删除新增行即可完全回退）
-- BL-IMG-GUANGTECH-CHANNEL F-GTI-02 fix_round 1 — GTI-DEF-04：为存量用户回填缺失的
-- NotificationPreference 行。
--
-- ## 为什么必须是迁移，而不是一句 handoff 提醒
--
-- `dispatcher.sendNotification` 对「用户没有该 eventType 的偏好行」是**静默丢弃**
-- （dispatcher.ts: `if (!pref || !pref.enabled) return false;`），而偏好行只在
-- `seedDefaultNotificationPreferences` 建号时写入，**从来没有自动回填路径**。
-- 于是同一个坑已经踩到第四次：
--
--   1. CHANNEL_DOWN / CHANNEL_RECOVERED / PENDING_CLASSIFICATION —— 生产 5 个 ADMIN
--      建号早于通知功能，一条偏好行都没有，从上线起没送达过任何人
--   2. AUTH_ALERT（F-BAX-05）—— 进了 enum 和 trigger 却没进 seed 名单，全员死信
--   3. SYNC_RECONCILE_SKIPPED（F-DSV4-03）—— 进了 seed 名单，但存量用户仍需人工
--      跑 scripts/backfill-notification-preferences.ts，而那个脚本**至今没人跑过**
--   4. SYNC_IMAGE_CHANNEL_SKIPPED（本批次）—— 上一轮 Generator 只在 handoff 里写了
--      「部署后记得跑回填脚本」。Evaluator 判定：依赖人工提醒的护栏不算护栏。
--
-- 部署流程只跑 `prisma migrate deploy`（deploy.yml 的 migrate 服务经
-- service_completed_successfully 门禁），所以把回填放进迁移 = 部署即自动执行、
-- 失败则 app 不启动。这是当前架构下唯一"人想忘也忘不掉"的位置。
--
-- ## 语义（与 src/lib/notifications/defaults.ts 严格一致）
--
--   ADMIN     → 全部事件类型 enabled=true
--   DEVELOPER → 仅 BALANCE_LOW / SPENDING_RATE_EXCEEDED enabled=true，其余 false
--   channels  → 一律 ["inApp"]（webhook 默认关，须用户去 Settings 显式开）
--
-- 遍历 `enum_range` 而非硬编码类型名单：本迁移执行时刻 enum 里有什么就补什么，
-- 不会因为将来新增类型而在这里留下一份会过期的副本。
--
-- ## 幂等
--
-- ON CONFLICT ("userId","eventType") DO NOTHING —— 只补缺失组合，
-- **绝不覆盖用户已经调过的开关**。重跑新增 0 行。

INSERT INTO notification_preferences (
  id, "userId", "eventType", channels, enabled, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  u.id,
  e.event_type,
  '["inApp"]'::jsonb,
  CASE
    WHEN u.role = 'ADMIN' THEN TRUE
    WHEN e.event_type IN ('BALANCE_LOW', 'SPENDING_RATE_EXCEEDED') THEN TRUE
    ELSE FALSE
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM users u
CROSS JOIN (
  SELECT unnest(enum_range(NULL::"NotificationEventType")) AS event_type
) e
ON CONFLICT ("userId", "eventType") DO NOTHING;
