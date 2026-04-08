-- P4 ModelAlias initial seed data
-- Maps provider-specific model IDs to canonical names

INSERT INTO "model_aliases" ("id", "alias", "modelName", "createdAt") VALUES
  -- DeepSeek aliases
  (gen_random_uuid()::TEXT, 'deepseek-chat', 'deepseek-v3', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'deepseek-reasoner', 'deepseek-reasoner', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'deepseek/deepseek-chat', 'deepseek-v3', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'deepseek/deepseek-r1', 'deepseek-reasoner', CURRENT_TIMESTAMP),

  -- Anthropic aliases (provider-prefixed → canonical)
  (gen_random_uuid()::TEXT, 'anthropic/claude-sonnet-4', 'claude-sonnet-4', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'anthropic/claude-sonnet-4-6', 'claude-sonnet-4-6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'anthropic/claude-opus-4-6', 'claude-opus-4-6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'anthropic/claude-3.5-haiku', 'claude-3.5-haiku', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'anthropic/claude-3-5-haiku-20241022', 'claude-3.5-haiku', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'anthropic/claude-haiku-4-5', 'claude-haiku-4-5', CURRENT_TIMESTAMP),

  -- Google aliases
  (gen_random_uuid()::TEXT, 'google/gemini-2.5-pro', 'gemini-2.5-pro', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'google/gemini-2.5-flash', 'gemini-2.5-flash', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'google/gemini-2.0-flash-001', 'gemini-2.0-flash', CURRENT_TIMESTAMP),

  -- X.AI aliases
  (gen_random_uuid()::TEXT, 'x-ai/grok-3', 'grok-3', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'x-ai/grok-3-mini', 'grok-3-mini', CURRENT_TIMESTAMP),

  -- Qwen aliases
  (gen_random_uuid()::TEXT, 'qwen/qwen-max', 'qwen-max', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'qwen/qwen-plus', 'qwen-plus', CURRENT_TIMESTAMP),

  -- MiniMax aliases
  (gen_random_uuid()::TEXT, 'minimax/minimax-01', 'minimax-01', CURRENT_TIMESTAMP),

  -- Moonshot aliases
  (gen_random_uuid()::TEXT, 'moonshotai/kimi-k2', 'kimi-k2', CURRENT_TIMESTAMP),

  -- Perplexity aliases
  (gen_random_uuid()::TEXT, 'perplexity/sonar', 'perplexity-sonar', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'perplexity/sonar-pro', 'perplexity-sonar-pro', CURRENT_TIMESTAMP),

  -- OpenAI version variants → merge to base model
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-11-20', 'gpt-4o', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-08-06', 'gpt-4o', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-05-13', 'gpt-4o', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'gpt-4o-mini-2024-07-18', 'gpt-4o-mini', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'o1-2024-12-17', 'o1', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'o3-mini-2025-01-31', 'o3-mini', CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'o4-mini-2025-04-16', 'o4-mini', CURRENT_TIMESTAMP);
