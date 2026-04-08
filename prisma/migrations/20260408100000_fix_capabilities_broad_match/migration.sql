-- Fix round 2: 使用更宽泛的匹配 + 显式 jsonb cast + 覆盖所有空值情况
-- 不限制 capabilities 当前值，直接覆盖为正确值（Admin 可通过 UI 随时调整）

-- 通用对话（旗舰）
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gpt-4o%' AND "name" NOT LIKE '%gpt-4o-mini%' AND "modality" = 'TEXT' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%claude-sonnet-4%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gemini-2.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%deepseek-chat%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%grok-3' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%qwen-plus%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%glm-4-plus%' OR "name" LIKE '%glm-4' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":true}'::jsonb WHERE "name" LIKE '%kimi%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 轻量/高速
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gpt-4o-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gemini-2.5-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gemini-2.0-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true,"function_calling":true}'::jsonb WHERE ("name" LIKE '%claude-3.5-haiku%' OR "name" LIKE '%claude-3-5-haiku%') AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%grok-3-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%glm-4-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":true}'::jsonb WHERE "name" LIKE '%minimax-01%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 长上下文
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%gemini-1.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":true}'::jsonb WHERE "name" LIKE '%doubao-pro-256k%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 推理
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}'::jsonb WHERE ("name" = 'o3' OR "name" LIKE '%/o3' OR "name" LIKE '%/o3-%') AND "name" NOT LIKE '%mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}'::jsonb WHERE "name" LIKE '%o4-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":true,"reasoning":true}'::jsonb WHERE "name" LIKE '%deepseek-reasoner%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":true,"reasoning":true}'::jsonb WHERE "name" LIKE '%deepseek-r1%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 搜索增强
UPDATE "models" SET "capabilities" = '{"streaming":true,"search":true}'::jsonb WHERE "name" LIKE '%sonar%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 阿里旗舰
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}'::jsonb WHERE "name" LIKE '%qwen-max%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 多模态视觉
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true}'::jsonb WHERE "name" LIKE '%doubao-vision%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- 图片生成
UPDATE "models" SET "capabilities" = '{"streaming":false}'::jsonb WHERE "name" LIKE '%gpt-image%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":false}'::jsonb WHERE "name" LIKE '%dall-e%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":false}'::jsonb WHERE "name" LIKE '%seedream%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":false}'::jsonb WHERE "name" LIKE '%cogview%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);
UPDATE "models" SET "capabilities" = '{"streaming":false}'::jsonb WHERE "name" LIKE '%Wanx%' AND ("capabilities" IS NULL OR "capabilities" = '{}'::jsonb);

-- supportedSizes
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1792","1792x1024"]'::jsonb WHERE "name" LIKE '%dall-e-3%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["256x256","512x512","1024x1024"]'::jsonb WHERE "name" LIKE '%dall-e' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1536","1536x1024","auto"]'::jsonb WHERE "name" LIKE '%gpt-image%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024","960x1280","1280x960","720x1440","1440x720"]'::jsonb WHERE "name" LIKE '%seedream-4.5%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024"]'::jsonb WHERE "name" LIKE '%cogview%' AND "supportedSizes" IS NULL;
UPDATE "models" SET "supportedSizes" = '["1024x1024","720x1280","1280x720"]'::jsonb WHERE "name" LIKE '%Wanx%' AND "supportedSizes" IS NULL;
