-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP COLUMN for new columns; data ops require restore from backup)
-- F-MC-01: Model.supportedSizes 字段（JSON 字符串数组，nullable）
ALTER TABLE "models" ADD COLUMN "supportedSizes" JSONB;

-- F-MC-04/05: 将 CAPABILITIES_MAP + SUPPORTED_SIZES_MAP 静态数据迁移到 DB
-- capabilities（含 reasoning + search 标签）
-- 仅更新 capabilities 为空的记录，不覆盖已有值

-- 通用对话（旗舰）
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gpt-4o%' AND "modality" = 'TEXT' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'claude-sonnet-4%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gemini-2.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" IN ('deepseek-chat','deepseek/deepseek-chat') AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" = 'grok-3' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" IN ('qwen-plus','qwen/qwen-plus') AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" IN ('glm-4-plus','glm-4') AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true}' WHERE "name" IN ('kimi','moonshotai/kimi') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 轻量/高速
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gpt-4o-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gemini-2.5-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gemini-2.0-flash%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true,"function_calling":true}' WHERE "name" IN ('claude-3.5-haiku','claude-3-5-haiku') AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'grok-3-mini%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" = 'glm-4-flash' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true}' WHERE "name" IN ('minimax-01','minimax/minimax-01') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 长上下文
UPDATE "models" SET "capabilities" = '{"vision":true,"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" LIKE 'gemini-1.5-pro%' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true}' WHERE "name" LIKE 'doubao-pro-256k%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 推理（reasoning: true）
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}' WHERE "name" = 'o3' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"reasoning":true}' WHERE "name" = 'o4-mini' AND ("capabilities" IS NULL OR "capabilities" = '{}');
UPDATE "models" SET "capabilities" = '{"streaming":true,"reasoning":true}' WHERE "name" IN ('deepseek-reasoner','deepseek-r1','deepseek/deepseek-r1') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 搜索增强（search: true）
UPDATE "models" SET "capabilities" = '{"streaming":true,"search":true}' WHERE "name" IN ('perplexity/sonar','perplexity/sonar-pro') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 阿里旗舰
UPDATE "models" SET "capabilities" = '{"json_mode":true,"streaming":true,"function_calling":true}' WHERE "name" IN ('qwen-max','qwen/qwen-max') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 多模态视觉
UPDATE "models" SET "capabilities" = '{"vision":true,"streaming":true}' WHERE "name" LIKE 'doubao-vision%' AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- 图片生成
UPDATE "models" SET "capabilities" = '{"streaming":false}' WHERE "name" IN ('gpt-image-1','dall-e-3','dall-e','Qwen/Wanx','seedream-4.5','cogview') AND ("capabilities" IS NULL OR "capabilities" = '{}');

-- supportedSizes（image 模型）
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1792","1792x1024"]' WHERE "name" LIKE 'dall-e-3%';
UPDATE "models" SET "supportedSizes" = '["256x256","512x512","1024x1024"]' WHERE "name" = 'dall-e';
UPDATE "models" SET "supportedSizes" = '["1024x1024","1024x1536","1536x1024","auto"]' WHERE "name" LIKE 'gpt-image-1%';
UPDATE "models" SET "supportedSizes" = '["1024x1024","960x1280","1280x960","720x1440","1440x720"]' WHERE "name" LIKE 'seedream-4.5%';
UPDATE "models" SET "supportedSizes" = '["1024x1024","960x1280","1280x960"]' WHERE "name" LIKE 'seedream%' AND "name" NOT LIKE 'seedream-4.5%';
UPDATE "models" SET "supportedSizes" = '["1024x1024"]' WHERE "name" LIKE 'cogview%';
UPDATE "models" SET "supportedSizes" = '["1024x1024","720x1280","1280x720"]' WHERE "name" LIKE 'Qwen/Wanx%';
