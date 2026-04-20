# BL-IMAGE-PARSER-FIX Spec

**批次：** BL-IMAGE-PARSER-FIX（OpenRouter 图片响应 `message.images[]` 解析缺失 P0 hotfix）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-21
**工时：** 0.3 day
**优先级：** **P0-hotfix**（3 个图片模型生产不可用 + 每次失败上游扣 $0.04-$0.20）

## 背景

KOLMatrix 姊妹项目 2026-04-20/21 两次报告 `gpt-image` / `gpt-image-mini` / `gemini-3-pro-image` 三个图片 alias 持续失败。用户报告"上游账单确认按图片模型扣费了"。

### 根因证据链（已核实）

1. **生产 pm2 日志**（`/opt/aigc-gateway` 过去 5000 行）
   ```
   [imageViaChat] extraction failed { stage: 'any-https', contentType: 'object'|'string',
     partTypes: [], urlCandidateCount: 0, dataUriFound: false,
     model: 'openai/gpt-5-image' | 'openai/gpt-5-image-mini' | 'google/gemini-3-pro-image-preview',
     provider: 'cmnckvv5m0031n56ics9pggfg' }   ← openrouter
   [failover] Attempt 1 failed on openrouter/openai/gpt-5-image (provider_error): ... text instead of image ...
   ```
2. **Provider config**（admin API）
   - openrouter: `imageViaChat: true` + quirks `image_via_chat_modalities` → 走 `imageViaChat()` 函数
   - chatanywhere: `imageViaChat: false` → 走 `/images/generations`（不涉及此 bug）
3. **直连 OpenRouter 实测**（同权限 key）三个模型返回结构一致：
   ```json
   {"choices":[{"message":{
     "role":"assistant",
     "content": null | "Is this close to what you were imagining?",
     "reasoning":"...",
     "images":[{"type":"image_url","image_url":{"url":"data:image/png;base64,iVBOR..."}}]
   }}], "usage":{"cost":0.0418|0.1378|0.1970}}
   ```
4. **Gateway parser 源码**（`src/lib/engine/openai-compat.ts:411-542`）`imageViaChat` 只检查 4 个位置，均**未检查 `message.images[]`**：
   - Stage 1: `msg.parts` 或 `Array.isArray(msg.content)`
   - Stage 2: `content` 里 `data:image/...;base64,...`
   - Stage 3: `content` 里带扩展名 URL
   - Stage 4: `content` 里任意 HTTPS URL

### 成本账（2026-04-21 实测 2h 内）

- OpenRouter 账单增量 $1.08
- 其中 KOLMatrix 4 次图片失败实际扣费 ≈ **$0.65**（gpt-5-image $0.20 + gpt-5-image-mini $0.04 + gemini-3-pro-image-preview ×2 $0.28）
- Gateway 内部 `call_logs.cost=$0` 未给用户计费（用户层无感）
- 每次失败烧 $0.04-$0.20

### 路由层次对图片模型的影响

- `gpt-image` alias → routing picks openrouter/openai/gpt-5-image first → fails → failover to chatanywhere/gpt-image-1.5 → 也 fails → 用户看到 "text instead of image"
- 连带 bug：call_logs 的 channelId 记成 chatanywhere 但 errorMessage 是 openrouter 的（已在 BL-BILLING-AUDIT backlog）

## 目标

**修复 `imageViaChat` parser 识别 OpenRouter 2026 新增 `message.images[]` 字段**，让 3 个图片 alias 恢复可用。

## 非目标

- 不修 chatanywhere `gpt-image-1.5` 失败（独立上游问题，留给 BL-BILLING-AUDIT 或单独观察）
- 不修 call_logs channelId 错位 bug（BL-BILLING-AUDIT 范围）
- 不改 `normalizeImageResponse`（chatanywhere 直连路径）
- 不改 failover / routing 逻辑
- 不重构 4 stage extraction 结构（只在前面插入 Stage 0）

## 设计

### F-IPF-01：`imageViaChat` 新增 Stage 0 识别 `message.images[]`

**文件：** `src/lib/engine/openai-compat.ts:411-542`

**改动位置：** 在原 Stage 1（multimodal parts 检查）之前插入 Stage 0。

**具体改动：**

```ts
protected async imageViaChat(
  request: ImageGenerationRequest,
  route: RouteResult,
): Promise<ImageGenerationResponse> {
  const chatReq: ChatCompletionRequest = {
    model: this.resolveModelId(route),
    messages: [{ role: "user", content: request.prompt }],
  };

  const result = await this.chatCompletions(chatReq, route);

  const choice = result.choices[0];
  const rawContent = choice?.message?.content;
  const msg = choice?.message as Record<string, unknown> | undefined;

  // Stage 0: OpenRouter 2026 起 multimodal 输出放 message.images[]（非 content / parts）
  // 证据：openai/gpt-5-image* + google/gemini-3-pro-image-preview 三个 route 实测返回此字段
  const images = msg?.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      const i = img as Record<string, unknown>;
      const imageUrl = i.image_url as Record<string, unknown> | undefined;
      if ((i.type === "image_url" || imageUrl) && typeof imageUrl?.url === "string") {
        return {
          created: result.created,
          data: [{ url: imageUrl.url as string }],
        };
      }
    }
  }

  const parts = msg?.parts ?? (Array.isArray(msg?.content) ? msg.content : null);
  // ... 原有 Stage 1-4 保持不动
}
```

**关键约束：**
- Stage 0 只在 `images` 为数组且有 `image_url.url` 时返回；否则继续走原 Stage 1-4（避免打破现有通路）
- 不修改 extraction failed 日志（已有的 stage='multimodal-parts'/'base64'/'url-with-ext'/'any-https' 日志保持）—— 新字段失败则自然继续落到原日志通路
- 不改错误消息 sanitize（types.ts）

### F-IPF-02：单测（checker & imageViaChat）

**文件：**
- 新增 `src/lib/engine/__tests__/image-via-chat.test.ts`

**用例：**
1. **OpenRouter gpt-5-image 形态** — mock `chatCompletions` 返回 `{choices:[{message:{content:null,images:[{type:'image_url',image_url:{url:'data:image/png;base64,abc'}}]}}]}` → `imageViaChat` 返回 `{data:[{url:'data:image/png;base64,abc'}]}`
2. **OpenRouter gemini 形态** — mock `content:'Is this close to what you were imagining?'` + `images:[{type:'image_url',image_url:{url:'data:image/png;base64,xyz'}}]` → 返回 `{data:[{url:'data:image/png;base64,xyz'}]}`（不被 content 文字干扰）
3. **旧路径回归** — mock `content` 数组里含 `{type:'image_url',image_url:{url:...}}` 且无 `images` 字段 → 仍从 Stage 1 parts 提取成功
4. **旧路径回归** — mock `content` 为 base64 data URI 字符串 + 无 `images` → 仍从 Stage 2 提取成功
5. **都失配** — mock `content:'just text response'` 无 images 无 parts → 抛 `EngineError` 含 "no_image_in_response" code
6. **images 为空数组** — mock `images:[]` → 落到原 Stage 1-4 按旧逻辑走

**回归验证：** 运行 `npx vitest run` 全量，确认 EMERGENCY +11 + LEAN +33 + fix round 1/2 旧单测**全绿**。

### F-IPF-03：Codex 全量验收

**构建与单测（3 项）：**
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新 6 单测 PASS + LEAN +33 + EMERGENCY +11 + 其他旧单测全绿）

**单测功能验证（3 项）：**
4. 确认 image-via-chat.test.ts 新 6 条 PASS，特别验证 Stage 0 优先级高于 Stage 1-4（即 `images` 字段存在时不再 fallback 到旧路径）
5. `imageViaChat` 被成功调用 的 return shape `{created, data:[{url}]}` 与 `normalizeImageResponse` 输出兼容
6. 错误 sanitize 不受影响（含 `returned no extractable image` → `did not return a valid image` 的转换逻辑不动）

**生产部署后 smoke test（4 项）：**
7. 部署后用 KOLMatrix 文档 §5 极简复现 curl 调 `/v1/images/generations` 以 `gemini-3-pro-image` + "A dark blue world map..." → HTTP 200 + 返回图片 URL（data:image/png;base64,...）
8. 同样方式调 `gpt-image` → HTTP 200 + 图片
9. 同样方式调 `gpt-image-mini` → HTTP 200 + 图片
10. pm2 logs 中 `[imageViaChat] extraction failed` 出现频次较上一小时显著下降（接近 0）

**11. 生成 signoff 报告 `docs/test-reports/BL-IMAGE-PARSER-FIX-signoff-2026-04-21.md`。**

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Stage 0 优先级过高导致误匹配某些 provider 的非图片 `images` 字段 | 代码只在 `images[i].image_url.url` 为 string 时返回；否则继续走原路径 |
| OpenRouter 未来再改字段（如挪回 `content`）| Stage 0 匹配失败自动 fallback 到 Stage 1-4，最坏 degraded 为当前行为（"text instead of image"）不更差 |
| 打断现有 Stage 1 multimodal parts 路径（如 Anthropic/其他 provider 仍用 parts）| 严格"images 数组且有 url 才 return"，否则 parts 路径不动 —— 单测回归覆盖 |

## 部署

- 纯代码变更，无 migration
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-IPF-03 的 11 项 PASS（7-10 生产 smoke 可在部署后补）
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档
