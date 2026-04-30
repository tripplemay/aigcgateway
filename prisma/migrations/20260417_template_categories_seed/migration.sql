-- ROLLBACK: revert commit + restore from backup (data migration is not idempotently reversible)
-- TEMPLATE-LIBRARY-UPGRADE F-TL-02: seed default template categories into SystemConfig
-- Inserts only if key does not already exist.
INSERT INTO "system_configs" ("id", "key", "value", "description", "updatedAt")
VALUES (
  'sysconfig_tpl_categories',
  'TEMPLATE_CATEGORIES',
  '[{"id":"dev-review","label":"开发审查","labelEn":"Dev Review","icon":"code_review"},{"id":"writing","label":"内容创作","labelEn":"Writing","icon":"edit_note"},{"id":"translation","label":"翻译","labelEn":"Translation","icon":"translate"},{"id":"analysis","label":"数据分析","labelEn":"Analysis","icon":"analytics"},{"id":"customer-service","label":"客服","labelEn":"Customer Service","icon":"support_agent"},{"id":"other","label":"其他","labelEn":"Other","icon":"category"}]',
  'Public template categories (id/label/labelEn/icon)',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
