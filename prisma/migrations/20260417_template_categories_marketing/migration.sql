-- ONBOARDING-ENHANCE F-OE-04 (BL-128a): extend TEMPLATE_CATEGORIES with 4
-- marketing categories. Idempotent: merges by id so re-running or manual
-- edits to the admin-curated list are preserved (new ids are appended at
-- the end, existing ids are left untouched).
DO $$
DECLARE
  marketing_cats jsonb := '[
    {"id":"social-content","label":"社交内容","labelEn":"Social Content","icon":"tag"},
    {"id":"short-video","label":"短视频脚本","labelEn":"Short Video","icon":"movie"},
    {"id":"ip-persona","label":"IP 与人设","labelEn":"IP & Persona","icon":"person"},
    {"id":"marketing-strategy","label":"营销策略","labelEn":"Marketing Strategy","icon":"trending_up"}
  ]'::jsonb;
  full_default jsonb := '[
    {"id":"dev-review","label":"开发审查","labelEn":"Dev Review","icon":"code_review"},
    {"id":"writing","label":"内容创作","labelEn":"Writing","icon":"edit_note"},
    {"id":"translation","label":"翻译","labelEn":"Translation","icon":"translate"},
    {"id":"analysis","label":"数据分析","labelEn":"Analysis","icon":"analytics"},
    {"id":"customer-service","label":"客服","labelEn":"Customer Service","icon":"support_agent"},
    {"id":"other","label":"其他","labelEn":"Other","icon":"category"},
    {"id":"social-content","label":"社交内容","labelEn":"Social Content","icon":"tag"},
    {"id":"short-video","label":"短视频脚本","labelEn":"Short Video","icon":"movie"},
    {"id":"ip-persona","label":"IP 与人设","labelEn":"IP & Persona","icon":"person"},
    {"id":"marketing-strategy","label":"营销策略","labelEn":"Marketing Strategy","icon":"trending_up"}
  ]'::jsonb;
  existing_value text;
  existing_json jsonb;
  existing_ids text[];
  merged jsonb;
  cat jsonb;
BEGIN
  SELECT value INTO existing_value FROM "system_configs" WHERE "key" = 'TEMPLATE_CATEGORIES';

  IF existing_value IS NULL THEN
    INSERT INTO "system_configs" ("id", "key", "value", "description", "updatedAt")
    VALUES (
      'sysconfig_tpl_categories',
      'TEMPLATE_CATEGORIES',
      full_default::text,
      'Public template categories (id/label/labelEn/icon)',
      CURRENT_TIMESTAMP
    );
    RETURN;
  END IF;

  BEGIN
    existing_json := existing_value::jsonb;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'TEMPLATE_CATEGORIES is not valid JSON, skipping merge';
    RETURN;
  END;

  IF jsonb_typeof(existing_json) <> 'array' THEN
    RAISE NOTICE 'TEMPLATE_CATEGORIES is not a JSON array, skipping merge';
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(e->>'id'), ARRAY[]::text[])
    INTO existing_ids
    FROM jsonb_array_elements(existing_json) e;

  merged := existing_json;
  FOR cat IN SELECT * FROM jsonb_array_elements(marketing_cats) LOOP
    IF NOT ((cat->>'id') = ANY(existing_ids)) THEN
      merged := merged || jsonb_build_array(cat);
      existing_ids := array_append(existing_ids, cat->>'id');
    END IF;
  END LOOP;

  UPDATE "system_configs"
     SET value = merged::text, "updatedAt" = CURRENT_TIMESTAMP
   WHERE "key" = 'TEMPLATE_CATEGORIES';
END $$;
