-- ROLLBACK: revert commit + restore from backup (data migration is not idempotently reversible)
-- ONBOARDING-ENHANCE F-OE-02: seed default WELCOME_BONUS_USD (1.00 USD).
-- Admin can tweak or zero it via admin/operations UI without redeploy.
INSERT INTO "system_configs" ("id", "key", "value", "description", "updatedAt")
VALUES (
  'sysconfig_welcome_bonus_usd',
  'WELCOME_BONUS_USD',
  '1.00',
  'USD credited to a new user''s balance on registration. Set to 0 to disable.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
