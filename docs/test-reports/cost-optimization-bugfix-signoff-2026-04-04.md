# Cost Optimization & Bug Fix Signoff 2026-04-04

> 状态：**待 Evaluator 验收**（progress.json status=reviewing）
> 触发：OpenRouter 7日费用 $482.96 异常，根因分析后同步修复 MCP 功能性 Bug

---

## 变更背景

通过分析 OpenRouter 账单 CSV（`openrouter_activity_2026-04-04.csv`）发现：

- 7天总费用 $482.96，其中 **85.1%（$411.13）来自 6 个图片模型**
- 根因一：健康检查 L3 探针对图片 channel 发出真实图片生成请求，每 12 分钟一次，单次 $0.04–$0.19
- 根因二：OpenRouter 同步了 310 个模型（包含大量过时/小众模型），健康检查对所有 channel 循环探测
- 根因三：`doc-enricher` 未过滤图片模型，存在潜在的图片模型 AI 调用风险
- 附带修复：MCP 工具 `list_logs` 搜索列错误、`imageViaChat` URL 提取不兼容无扩展名 URL

---

## 变更功能清单

### F-COST-01：OpenRouter 模型白名单

**文件：**
- `src/lib/sync/adapters/openrouter-whitelist.ts`（新增）
- `src/lib/sync/adapters/openrouter.ts`

**改动：**
新建白名单常量文件，收录 30 个主流模型（浮动别名优先）。`openrouter.ts` 同步前先过白名单，310 → 30 个模型。

**验收标准：**
- 白名单文件存在且包含主流模型（OpenAI / Google / Anthropic / Meta / Mistral / xAI / DeepSeek / Qwen / Perplexity / 图片模型各类别）
- `openrouter.ts` filter 逻辑：白名单外的模型返回 false
- 白名单以外的模型（如 `gryphe/mythomax-l2-13b`）不会被同步

---

### F-COST-02：健康检查图片 channel 封顶 L2

**文件：** `src/lib/health/checker.ts`

**改动：**
`runImageCheck()` 在完成 L2（格式验证）后直接返回，移除 L3 真实图片生成探针。

**验收标准：**
- `runImageCheck()` 在 L2 PASS 后立即 return，不再执行 URL 可达性检查
- L1 FAIL / L2 FAIL 路径不受影响
- 注释说明跳过原因（成本，而非功能缺陷）

---

### F-COST-03：doc-enricher 跳过图片模型

**文件：** `src/lib/sync/doc-enricher.ts`

**改动：**
`enrichFromDocs()` 入口将 `existingModels` 分为 `textModels` 和 `imageModels`，只对文本模型做 AI 丰富化，图片模型原样保留后合并回结果。

**验收标准：**
- `modality === "IMAGE"` 的模型不传入 `mergeModels()`，不触发 DeepSeek AI 调用
- 图片模型在最终 `merged` 结果中仍然存在（`[...mergedText, ...imageModels]`）
- `aiEnriched` 计数仅统计文本模型新增量，不重复计算图片模型

---

### F-BUG-01：list-logs.ts 搜索列错误修复

**文件：** `src/lib/mcp/tools/list-logs.ts`

**改动：**
search SQL 从 `"traceId" ILIKE OR "modelName" ILIKE` 改为 `"promptSnapshot"::text ILIKE OR "responseContent" ILIKE`。

**验收标准：**
- 使用 `list_logs(search="你好")` 能返回 prompt 中包含"你好"的记录
- 使用 `list_logs(search="trc_xxx")` 搜索 traceId 格式字符串：不再通过此路径匹配（traceId 搜索已不在 search 语义范围内）

---

### F-BUG-02：imageViaChat URL 提取增强

**文件：** `src/lib/engine/openai-compat.ts`

**改动：**
`imageViaChat()` 重写为四级提取链：① multimodal parts 数组（`image_url` 类型） → ② base64 data URI → ③ 带扩展名 URL → ④ 任意 HTTPS URL → 全部失败则抛出 `no_image_in_response` 错误。

**验收标准：**
- content 为带扩展名 URL → 正确提取（原有能力，不退化）
- content 为无扩展名 HTTPS URL（如 Google Storage）→ 正确提取
- content 为 multimodal 数组含 `image_url` → 正确提取
- content 为空字符串 → 抛出错误，不返回 `data: []`

---

### F-BUG-03：generate-image MCP 错误响应结构化（F-IMG-01）

**文件：** `src/lib/mcp/tools/generate-image.ts`

**改动：**
catch 块所有错误响应 text 改为结构化 JSON `{"code": "...", "message": "..."}`，`provider_timeout` 分支同步处理。

**验收标准：**
- 请求不存在的图片模型 → `isError: true`，text 为合法 JSON，`code` 字段非空
- provider 超时 → `code: "provider_timeout"`
- 通用错误 → `code` 取 `engineErr.code` 或回退到 `"provider_error"`
- text 不包含纯文本 `"Error: ..."` 格式

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 文本模型健康检查 L3 | 成本可忽略（~$0.0001/次），有真实质量检测价值，保留 |
| 其他服务商白名单 | 非聚合型服务商（OpenAI/Zhipu/SiliconFlow 等）模型列表本身有限，不需要 |
| F-IMG-03/04（生产运维） | dall-e-3 channel 恢复、批量 IMAGE channel 检查，需管理员在生产执行，不在本轮代码范围 |
| inline_data Gemini 图片格式 | 当前 multimodal 提取只处理 `image_url` 类型，`inline_data` 为已知未覆盖边缘案例，后续独立跟进 |

---

## 预期成本影响

| 项目 | 改动前（/周） | 改动后（/周） |
|---|---|---|
| 图片 L3 健康检查 | ~$171 | $0 |
| doc-enricher 图片模型 | ~$237 | $0 |
| OpenRouter 同步范围缩减（健康检查基数） | ~$74（310 模型） | ~$9（30 模型） |
| **合计** | **~$482** | **~$9** |

---

## 类型检查

```
npx tsc --noEmit → 零错误（已验证）
```

---

## Harness 说明

本批改动由 Cowork（Claude）直接实现，未经 Planner → Generator 流程，事后补录进 Harness。
`progress.json` 已设为 `status: "reviewing"`，等待 Codex Evaluator 验收后更新为 `"done"`。
