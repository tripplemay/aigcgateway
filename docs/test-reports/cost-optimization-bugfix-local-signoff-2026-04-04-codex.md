# 成本优化 + Bug 修复批次本地验收报告

## 测试目标

验证 `progress.json` 当前批次 7 个已完成功能是否满足本地验收要求：

- `F-COST-01` OpenRouter 模型白名单
- `F-COST-02` 图片健康检查封顶 L2
- `F-COST-03` doc-enricher 跳过图片模型 AI 丰富化
- `F-BUG-01` `list-logs.ts` 搜索列修复
- `F-BUG-02` `imageViaChat` URL 提取增强
- `F-BUG-03` `generate-image` MCP 错误响应结构化
- `F-ARCH-01` OpenRouter 白名单维护规范

## 测试环境

- 环境：本地 `localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh`
- 本地管理员账号：`admin@aigc-gateway.local`
- 本地测试项目：`Evaluator Project 2026-04-04`

## 执行步骤概述

1. 重新初始化本地测试环境并确认 `3099` 可访问。
2. 触发本地模型同步，读取同步结果与管理接口数据。
3. 对成本优化相关功能做代码路径核对与最小 mock 执行。
4. 对 MCP 日志搜索与图片错误格式做本地真实调用验证。
5. 汇总通过、部分通过、风险项，并回写状态机。

## 结果总览

- `PASS`: 6
- `PARTIAL`: 1
- `FAIL`: 0

## 逐项结果

### `F-COST-01` OpenRouter 模型白名单

- 结果：`PARTIAL`
- 验证结果：
  - 本地触发 `/api/admin/sync-models` 后，`openrouter` 同步结果为 `apiModels=29 / modelCount=29`
  - `src/lib/sync/adapters/openrouter.ts` 已明确在同步前走 `OPENROUTER_MODEL_WHITELIST`
  - `src/lib/sync/adapters/openrouter-whitelist.ts` 中我实际数到的白名单条目为 `30`，不是描述中的 `32`
- 结论：
  - “通过白名单显著收窄同步范围”这一目标已实现
  - 但实现与 feature 描述中的数量不一致，不能判满分通过

### `F-COST-02` 健康检查图片 channel 封顶 L2

- 结果：`PASS`
- 证据：
  - `src/lib/health/checker.ts` 中图片检查在 `FORMAT` 通过后直接 `return`
  - 通过测试脚本 `scripts/test/_archive_2026Q1Q2/evaluator-cost-bug-batch-2026-04-04.ts` 实测：
    - `imageCalls = 1`
    - `chatCalls = 0`
    - 返回 level 仅有 `CONNECTIVITY`、`FORMAT`
    - 没有 `QUALITY`

### `F-COST-03` doc-enricher 跳过图片模型 AI 丰富化

- 结果：`PASS`
- 证据：
  - `src/lib/sync/doc-enricher.ts` 中将 `existingModels` 分为 `textModels` 与 `imageModels`
  - 当输入仅包含图片模型时直接返回 `aiEnriched = 0`
  - 通过测试脚本 `scripts/test/_archive_2026Q1Q2/evaluator-cost-bug-batch-2026-04-04.ts` 实测：
    - 纯图片模型输入未触发 DeepSeek AI 调用
    - 混合输入时仅文本模型参与 AI merge，图片模型原样保留

### `F-BUG-01` `list-logs.ts` 搜索列修复

- 结果：`PASS`
- 证据：
  - `src/lib/mcp/tools/list-logs.ts` 搜索 SQL 已改为：
    - `jsonb_array_elements(promptSnapshot::jsonb) ->> 'content' ILIKE`
    - `OR responseContent ILIKE`
    - `OR modelName ILIKE`
  - 本地真实调用验证：
    - 将一个 OpenRouter 文本通道临时置为 `ACTIVE`
    - 通过 `/v1/chat/completions` 发送唯一 prompt `needle-prompt-search-2026-04-04`
    - MCP `list_logs(search=needle-prompt-search-2026-04-04)` 返回该错误日志，命中 `promptSnapshot` 内容

### `F-BUG-02` `imageViaChat` URL 提取增强

- 结果：`PASS`
- 证据：
  - 通过最小继承测试直接执行 `imageViaChat`
  - 三类输入均被正确提取：
    - `image_url` → `https://cdn.example.com/a.png`
    - `inline_data` → `data:image/png;base64,YWJj`
    - 无扩展名 HTTPS URL → `https://storage.googleapis.com/bucket/object123`

### `F-BUG-03` `generate-image` MCP 错误响应结构化

- 结果：`PASS`
- 证据：
  - 本地 MCP 调用 `generate_image(model=nonexistent/image-model)` 返回：
    - `{"code":"model_not_found","message":"..."}`
  - 本地 MCP 调用 `generate_image(model=openrouter/openai/gpt-5-image-mini)` 返回：
    - `{"code":"channel_unavailable","message":"No active channel available for model ..."}`
  - 两类错误均可被 `JSON.parse()` 正确解析

### `F-ARCH-01` OpenRouter 白名单维护规范

- 结果：`PASS`
- 证据：
  - `src/lib/sync/adapters/openrouter-whitelist.ts` 顶部已明确写出：
    - 优先使用浮动别名
    - 版本快照仅合规需求时使用
    - 建议每季度审查一次

## 风险项

- 本地数据库 `call_logs` 仍存在遗留触发器问题：
  - 手动插入 `call_logs` 时触发 `record "new" has no field "search_vector"`
  - 这不是本轮 7 个功能的直接回归点，但说明测试库清理不彻底
- 本地 shell 侧 Prisma 与运行中的 `3099` 服务显然不在同一份数据视图上：
  - 因此本轮优先采用 HTTP 接口与运行中服务做验收，不用 shell Prisma 结果作为产品结论

## 最终结论

本轮 7 个功能中：

- 6 项通过
- 1 项部分通过
- 0 项失败

因此当前批次**不能直接进入 `done`**，应保持 `reviewing`，并将 `F-COST-01` 退回待修正或待说明状态。
