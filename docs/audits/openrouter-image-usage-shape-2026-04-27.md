# OpenRouter Image-via-Chat Usage Shape Investigation (2026-04-27)

**Batch:** BL-RECON-FIX-PHASE2 — F-RP-01
**Goal:** 真实捕获 OpenRouter `google/gemini-2.5-flash-image` 的 chat-completions 响应 raw shape，确认 H1/H2/H3 哪个假设成立，决定 F-RP-02 的实现分支。

---

## 三假设回顾

| Hypothesis | 描述 | 决定 F-RP-02 走哪个分支 |
|---|---|---|
| **H1** | `completion_tokens` 已包含 image output tokens（但被 sse-parser 截断） | C 分支（修流末尾 usage 聚合） |
| **H2** | OR 在 `usage.completion_tokens_details.image_tokens` 单独返 image tokens | A 分支（把 image_tokens 加到 completion_tokens 总计） |
| **H3** | OR 在 `usage.cost`（USD）直返本次实收金额 | B 分支（新增 `Usage.upstreamCostUsd`，post-process 优先用此值作 costUsd） |

Spec hint: 同时支持 H2/H3 时优先选 H3（cost 直返最权威，不依赖 token 单价配置正确性）。

---

## 实证调用

### 调用方法

- 通过 SSH 在生产服务器（`/opt/aigc-gateway`），从 `providers.authConfig.apiKey`（openrouter row）读取 OR API key
- `curl POST https://openrouter.ai/api/v1/chat/completions`
- Prompt: `"A simple red circle on white background"`
- Model: `google/gemini-2.5-flash-image`
- Body: minimal — 仅 `{model, messages}`，无 stream / 无 transforms

### Raw response（image base64 已剥）

```json
{
  "id": "gen-1777274549-ggCU4VodGLK3d1SNKnBJ",
  "provider": "Google",
  "model": "google/gemini-2.5-flash-image",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "native_finish_reason": "STOP",
      "message": {
        "role": "assistant",
        "content": "Here is a simple red circle on a white background for you: ",
        "images_count": 1,
        "images_first_meta": {
          "type": "image_url",
          "image_url": {
            "url_prefix": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAA",
            "url_length": 294310
          }
        }
      }
    }
  ],
  "usage": {
    "prompt_tokens": 7,
    "completion_tokens": 1304,
    "total_tokens": 1311,
    "cost": 0.0387371,
    "is_byok": false,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0,
      "audio_tokens": 0,
      "video_tokens": 0
    },
    "cost_details": {
      "upstream_inference_cost": 0.0387371,
      "upstream_inference_prompt_cost": 2.1e-06,
      "upstream_inference_completions_cost": 0.038735
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "image_tokens": 1290,
      "audio_tokens": 0
    }
  }
}
```

### Reverse-lookup（同请求 ID 反查）

`GET https://openrouter.ai/api/v1/generation?id=gen-1777274549-ggCU4VodGLK3d1SNKnBJ` 返回：

```json
{
  "data": {
    "model": "google/gemini-2.5-flash-image",
    "tokens_prompt": 10,
    "tokens_completion": 15,
    "native_tokens_prompt": 7,
    "native_tokens_completion": 1304,
    "native_tokens_completion_images": 1290,
    "native_tokens_reasoning": 0,
    "num_media_completion": 1,
    "finish_reason": "stop",
    "usage": 0.0387371,
    "total_cost": 0.0387371,
    "provider_responses": [
      { "endpoint_id": "9fc81a95-…", "model_permaslug": "google/gemini-2.5-flash-image", "provider_name": "Google", "status": 200 }
    ]
  }
}
```

---

## 假设核证结果

| Hypothesis | 字段位置 | 实测值 | 状态 |
|---|---|---|---|
| **H3（cost 直返）** | `usage.cost` | `0.0387371` USD | ✅ **确认存在**（与 reverse-lookup `total_cost` 完全一致） |
| **H3 备选** | `usage.cost_details.upstream_inference_cost` | `0.0387371` USD | ✅ 备选字段，值同主字段 |
| **H2（image_tokens 单独字段）** | `usage.completion_tokens_details.image_tokens` | `1290` | ✅ **确认存在**，与 reverse-lookup `native_tokens_completion_images` 一致 |
| **H1（completion_tokens 含 image）** | `usage.completion_tokens` | `1304`（≈ 14 文本 + 1290 image） | ⚠️ **部分成立**：完成 token **数量**已含 image_tokens，但 image-output 的**单价**与文本不同 |

---

## 关键洞察 — 真根因不是 token 数量，而是单价错位

### 数学推导

- 实测 `completion_tokens: 1304`
- 我们的 channel.costPrice：`{outputPer1M: 2.5}`（目前生产配置）
- 用现有公式：`1304 × $2.50 / 1M = $0.00326 / call`
- gateway DB 实际记录（spec 引用 04-26 数据）：5 calls × $0.00324/call = $0.0162 / 5 ≈ **匹配 $0.00326**
- OR 实收：$0.0387 / call → 5 calls × $0.0387 = $0.1935（生产观察）

### 隐含的 image-token 单价

`upstream_inference_completions_cost: 0.038735` ÷ `image_tokens: 1290` ≈ **$30.0 / 1M tokens**

→ Gemini-2.5-flash-image 的 image-output tokens 实收单价 ≈ $30/M，远高于我们配置的文本 output $2.5/M。**12× 漏算来自 image_tokens 与文本 output 共用了同一档单价**，不是 token 没被记录。

### 这意味着 A/C 分支不可行

- **A 分支（把 image_tokens 加到 completion_tokens）：失败** — completion_tokens 已经包含 image_tokens 了，再加是重复
- **C 分支（修 sse-parser 截断）：不适用** — 本次调用是 non-stream，问题在单价不在流处理
- 真要走 token 路径修，需要为每个 image-via-chat channel 各自配独立的 `imagePer1M` 字段（A' 变体），但这就违背了"修适配层不动 channel 配置"的目标

---

## 决定：F-RP-02 走 B 分支（usage.cost 直返 passthrough）

### 设计要点

1. **`Usage` interface 扩展**（`src/lib/engine/types.ts`）
   ```ts
   export interface Usage {
     prompt_tokens: number;
     completion_tokens: number;
     total_tokens: number;
     reasoning_tokens?: number;
     /** F-RP-02: 上游直返的实收 USD（如 OR 的 usage.cost），存在则 post-process
      *  优先用此值作 costUsd，绕过 token×单价公式。 */
     upstreamCostUsd?: number;
   }
   ```

2. **`extractUsage` 扩展**（`src/lib/engine/openai-compat.ts:703-723`）
   ```ts
   const upstreamCostUsd =
     toNumber(raw.cost) ??
     toNumber((raw.cost_details as Record<string, unknown> | undefined)?.upstream_inference_cost);
   if (upstreamCostUsd !== undefined && upstreamCostUsd > 0) {
     usage.upstreamCostUsd = upstreamCostUsd;
   }
   ```

3. **`calculateTokenCost` 扩展**（`src/lib/api/post-process.ts:510-551`）
   - 若 `usage.upstreamCostUsd != null && > 0`：`costUsd = usage.upstreamCostUsd`
   - `sellUsd` 仍按现有公式（保留我们的定价决策；user-facing markup 不受影响）

### 为什么 sellUsd 不一起 passthrough

- `usage.cost` 是 OR 给我们的成本，不是我们卖给用户的价
- 用户的 `sellPrice` 是产品定价决策（含我们的 markup 比例），由 alias.sellPrice / channel.sellPrice 配置
- 修改 sellUsd 计算逻辑属于另一个独立产品决策（"image-via-chat 卖价应否随 OR 实收浮动"），不在本批次范围
- 当前现实：gemini-2.5-flash-image alias.sellPrice = `{out/1M: 3}`，sellUsd = 1304×3/1M = $0.0039；和 OR 实收 $0.0387 的 sell price 设计 gap 由产品端单独决定

### 7 个 ⚠️ token-priced channel 全部受益

`F-RF-03` audit 报告列出的 6 个 OR image-via-chat channel + 1 zhipu cogview-3：
- 6 OR channel：本批次修适配层后**全部自动算对**（OR 都返 usage.cost）
- 1 zhipu cogview-3：zhipu adapter 是否返类似 cost 字段 = 待 zhipu 启用时单独验证（不在本批次）

### Phase 2 的非目标确认

- ❌ 不动 channel.costPrice 配置（保持 token-priced；公式被 upstreamCostUsd 短路绕过）
- ❌ 不改 sellPrice / 用户扣费金额（产品独立决策）
- ❌ 不动 calculateCallCost / calculateImageCost（仅 token-priced 路径加分支）
- ❌ 不修阈值粒度

---

## F-RP-02 实施 checklist

- [ ] `src/lib/engine/types.ts` 加 `Usage.upstreamCostUsd?: number`
- [ ] `src/lib/engine/openai-compat.ts:703-723` extractUsage 加 cost 读取（双 fallback 链：`raw.cost` → `raw.cost_details.upstream_inference_cost`）
- [ ] `src/lib/api/post-process.ts:510-551` calculateTokenCost 在 costUsd 计算前加 `usage.upstreamCostUsd > 0` 短路分支
- [ ] 单测扩展：existing tests 补 fixture `cost` 字段（保证现有 tier1 reconcile 仍 PASS）+ 新增 mock OR image 响应 → `costUsd ∈ [$0.030, $0.045]` 断言
- [ ] **回归**：纯文本 chat（无 cost 字段，不返 cost）行为不变 — `extractUsage` 不写 upstreamCostUsd，calculateTokenCost 走原 token×单价 公式

## F-RP-03 实施 checklist

- [ ] 新建 `src/lib/engine/__tests__/image-via-chat-cost.test.ts`（或扩展 image-via-chat-e2e.test.ts）
- [ ] mock OR 完整响应（用本报告的 raw shape：1304 completion / 1290 image_tokens / cost 0.0387371）
- [ ] 跑 imageViaChat → post-process 链路，断言 CallLog.costPrice ∈ [$0.030, $0.045]
- [ ] 文本回归测：纯 chat（无 cost）→ costUsd 仍按 token×单价 计算

---

## 附录 — F-RP-04 验收时建议复用本报告

- 实证 traceId / OR generation id：`gen-1777274549-ggCU4VodGLK3d1SNKnBJ`（本调用）
- 实证 image_tokens：1290 / completion_tokens：1304 / cost：$0.0387371
- 复测时 prompt 用：`"A simple red circle on white background"`（保持与本调研一致以便量级对比）
