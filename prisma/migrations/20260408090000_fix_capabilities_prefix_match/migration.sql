-- ROLLBACK: revert commit + restore from backup (data migration is not idempotently reversible)
-- Fix: capabilities 数据迁移补丁 — 覆盖带 provider 前缀的模型名（如 openai/gpt-4o）
-- 原 migration 仅匹配 'gpt-4o%'，未覆盖 'openai/gpt-4o' 等带前缀的名称
-- 使用 %/suffix% 模式匹配带前缀的变体，仅更新 capabilities 为空的记录

-- 通用对话（旗舰）— 带前缀的变体
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gpt-4o%' AND "name" NOT LIKE '%/gpt-4o-mini%' AND "modality" = 'TEXT' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/claude-sonnet-4%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gemini-2.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/grok-3' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 轻量/高速 — 带前缀的变体
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gpt-4o-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gemini-2.5-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gemini-2.0-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/claude-3.5-haiku%' OR "name" LIKE '%/claude-3-5-haiku%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/grok-3-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/glm-4-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/glm-4-plus%' OR "name" LIKE '%/glm-4' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 长上下文 — 带前缀
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/gemini-1.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true}' WHERE "name" LIKE '%/doubao-pro-256k%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 推理 — 带前缀
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}' WHERE "name" LIKE '%/o3%' AND "name" NOT LIKE '%/o3-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}' WHERE "name" LIKE '%/o4-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true,"reasoning":true}' WHERE "name" LIKE '%/deepseek-reasoner%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 多模态视觉 — 带前缀
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true}' WHERE "name" LIKE '%/doubao-vision%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 阿里旗舰 — 带前缀
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/qwen-max%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE '%/qwen-plus%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 图片生成 — 带前缀
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" LIKE '%/gpt-image-1%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" LIKE '%/dall-e-3%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" LIKE '%/dall-e' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" LIKE '%/seedream%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" LIKE '%/cogview%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- supportedSizes — 带前缀
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1792","1792x1024"]' WHERE "name" LIKE '%/dall-e-3%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["256x256","512x512","1024x1024"]' WHERE "name" LIKE '%/dall-e' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1536","1536x1024","auto"]' WHERE "name" LIKE '%/gpt-image-1%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024","960x1280","1280x960","720x1440","1440x720"]' WHERE "name" LIKE '%/seedream-4.5%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024"]' WHERE "name" LIKE '%/cogview%' AND "supportedSizes" IS NULL;
