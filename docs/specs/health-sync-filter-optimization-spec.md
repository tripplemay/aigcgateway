# 健康检查与同步优化规格文档

**批次：** 健康检查与同步优化批次
**日期：** 2026-04-04
**状态：** planning

---

## 背景

本批次针对两类问题：

1. **健康检查成本**：图片通道健康检查每次调用 `imageGenerations()` 会真实生成图片并产生费用。活跃图片通道每 10 分钟检查一次，成本显著。

2. **同步逻辑缺陷**：
   - 白名单清理逻辑在安全防护 early return 之后，API 故障时清理被跳过，导致白名单无法生效。
   - SiliconFlow 关键词黑名单不完整，BAAI/bge 等 embedding 模型因名称不含关键词而漏网。
   - 智谱 AI 全量同步，无任何过滤。

---

## F-HEALTH-01：图片通道健康检查改为 /models 轻量探测

### 问题
`checker.ts` 的 `runImageCheck()` 通过调用 `adapter.imageGenerations()` 做连通性检测，这会真实生成一张图片。L1 和 L2 都基于同一次图片生成请求的返回结果判断，无额外调用，但这一次调用本身就有成本（如 DALL-E 单次 $0.04）。

### 方案
对图片通道，改为调用 Provider 的 `/v1/models` 接口做连通性和格式验证：

- **L1 连通性**：HTTP 200 + 响应非空
- **L2 格式**：响应包含 `data` 数组

该接口为元数据接口，无任何计费行为，且能验证 API Key 有效性和网络可达性。

### 实现要点

`runImageCheck(route)` 中：
1. 不再调用 `adapter.imageGenerations()`
2. 改为直接 fetch `{baseUrl}/models`，带 `Authorization: Bearer {apiKey}` header
3. 使用 `fetchWithTimeout` 并支持 proxy（与现有 fetch 逻辑保持一致）
4. 返回 CheckResult[] 格式不变，level 依然是 CONNECTIVITY 和 FORMAT

### 注意事项
- 文本通道的 `runTextCheck()` 不变
- `runImageCheck()` 中不需要传入 `adapter`，直接用 `route.provider` 的 baseUrl 和 authConfig 构造请求

---

## F-SYNC-01：修复白名单清理被安全防护跳过

### 问题
`syncProvider()` 中操作顺序：

```
fetchModels() → [Layer 2] → 安全防护 early return ← 白名单清理永远到不了这里
                                  ↓（API 正常时才会继续）
                              白名单清理 → reconcile
```

当 OpenRouter API 故障时，`fetchModels()` 返回空，安全防护触发 early return，白名单清理跳过。

### 方案
将白名单清理提前，在安全防护之前独立执行：

```
fetchModels() → [Layer 2] → 白名单清理（独立，始终执行）
                                  ↓
                             安全防护 early return（只影响 reconcile）
                                  ↓（API 正常时）
                             reconcile
```

### 实现要点

在 `syncProvider()` 中：
1. 在 `existingChannelCount` 查询和安全防护判断之前，提前执行白名单清理逻辑
2. 白名单清理逻辑本身不变：找到所有 `status != DISABLED` 且 `realModelId` 不在白名单中的 channel，批量 updateMany 为 DISABLED
3. 安全防护和 reconcile 保持原位不变

---

## F-FILTER-SL：硅基流动模型过滤

### 问题
- `inferModality()` 只返回 TEXT 或 IMAGE，无法识别 EMBEDDING/RERANKING/AUDIO
- SiliconFlow 关键词黑名单（`EXCLUDED_KEYWORDS`）漏掉了按命名规律无关键词的专用模型：
  - `BAAI/bge-large-en-v1.5`、`BAAI/bge-m3`（embedding，名字无 "embedding"）
  - `FunAudioLLM/CosyVoice2-0.5B`（TTS，名字无 "tts"/"audio"）
  - `FunAudioLLM/SenseVoiceSmall`（ASR，名字无 "asr"/"audio"）

### 方案

**第一步：扩展 `inferModality()` in `base.ts`**

新增返回类型 `"EMBEDDING" | "RERANKING" | "AUDIO"`，识别规则：

| 类型 | 关键词模式 |
|---|---|
| EMBEDDING | `bge`, `embed`, `e5-`, `text-embedding` |
| RERANKING | `reranker`, `rerank` |
| AUDIO | `tts`, `whisper`, `asr`, `cosyvoice`, `sensevoice`, `speech`, `audio`, `voice` |
| IMAGE | `dall-e`, `image`, `cogview`, `seedream`, `stable-diffusion`, `sd-`, `sdxl`, `flux` |
| TEXT | 其他（默认） |

返回类型改为 `"TEXT" | "IMAGE" | "EMBEDDING" | "RERANKING" | "AUDIO"`。

**第二步：更新 SiliconFlow 适配器**

1. 移除旧的 `EXCLUDED_KEYWORDS` 黑名单
2. 使用扩展后的 `inferModality()`，只保留 TEXT 和 IMAGE 模型
3. 实现 `filterModel(modelId)`：返回 `inferModality(modelId) === "TEXT" || inferModality(modelId) === "IMAGE"`，触发 model-sync 的 cleanup 机制清理存量非法通道

### 注意事项
- `inferModality()` 返回类型变更会影响所有使用它的地方，需检查 TypeScript 类型兼容性
- 其他适配器（OpenAI、Anthropic 等）不使用 inferModality 做过滤，不受影响
- `checker.ts` 中 F-HEALTH-01 用到的 `route.model.modality` 来自 DB，不受 inferModality 变更影响

---

## F-FILTER-ZP：智谱 AI 模型过滤

### 问题
智谱适配器无任何过滤，全量同步所有模型，包含 embedding 等非对话模型。

### 方案
复用 F-FILTER-SL 中扩展后的 `inferModality()`：

1. 在 `fetchModels()` 中过滤，只返回 TEXT 和 IMAGE 模型
2. 实现 `filterModel(modelId)`，触发 cleanup 机制

---

## 执行顺序建议

1. `F-FILTER-SL`（先扩展 `inferModality`，后续功能依赖它）
2. `F-FILTER-ZP`（复用扩展后的 inferModality）
3. `F-SYNC-01`（修复 cleanup 顺序，独立改动）
4. `F-HEALTH-01`（独立改动）
