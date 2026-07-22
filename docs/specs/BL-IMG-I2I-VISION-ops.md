# BL-IMG-I2I-VISION — Ops 记录（上游契约探测 + 脚本用法 + 回滚）

**批次：** BL-IMG-I2I-VISION（图生图 + MCP 图片输入）
**创建：** 2026-07-22

---

## 1. F-IIV-04 — Volcengine seedream-4-5 上游 i2i 契约探测（D5 前置实测）

**探测时间：** 2026-07-22
**探测环境：** 生产 volcengine key + 生产 channel `ep-20260604162024-k2sbk`（seedream-4-5），直连 `https://ark.cn-beijing.volces.com/api/v3`，从 deploysvr 发起。

### 探测矩阵与结论

| # | 路径 | 源图形态 | 结果 | 关键证据 |
|---|---|---|---|---|
| A | `POST /chat/completions`，messages content 数组带 `image_url` | URL | ❌ **FAIL** | `InvalidParameter: the requested model doubao-seedream-4-5-251128 does not support this api`——**chat API 对 seedream-4-5 整体不可用**（含纯文本），非 i2i 特有 |
| B | `POST /images/generations`，body 带 `image`（单 string URL） | http URL | ✅ PASS | 返回 `data[0].url`（TOS 签名 URL），`usage.generated_images=1` |
| C | `POST /images/generations`，body 带 `image`（string[] 2 张） | URL 数组 | ✅ PASS | 多图融合正常出图，响应形态同 B |
| D | `POST /images/generations`，body 带 `image`（base64 data URI，115KB jpeg） | data:image/jpeg;base64 | ✅ PASS | 响应形态同 B |

### 附带发现

1. **size 最小像素约束**：`size=1024x1024` 被拒——`image size must be at least 3686400 pixels`（约 1920×1920）。adapter 既有多尺寸重试（默认 → 1024x1024 → 2048x2048）恰好兜住；**1024x1024 这一档对 seedream-4-5 恒失败**，实际由 2048x2048 出图。alias `seedream-4-5` capabilities 里的 `supported_sizes: ["1024x1024","1024x1792","1792x1024"]` 为陈旧配置（不被 size 预校验消费——预校验只读 `model.supportedSizes`，当前为 null——暂无害，建议后续修正）。
2. **响应形态**：i2i 与 t2i 完全同构 `{model, created, data:[{url,size}], usage:{generated_images, output_tokens, total_tokens}}` → `normalizeImageResponse` 提取链零改动兼容（F-IIV-04 响应链核验结论）。
3. **chat 优先策略的实际效果**：现网 volcengine adapter 对 seedream-4-5 的 imageViaChat 恒失败（probe A），所有生成实际都走 imageFallback（images 端点）。i2i 源图上送因此落在 `imageFallback` body 的 `image` 字段（probe B/C/D 实测通过的路径）。

### 代码落点（以实测为准）

- `src/lib/engine/adapters/volcengine.ts`
  - `imageFallback`：`request.image` 存在时 body 增 `image` 字段（string[] 透传，上游接受 string | string[]）。
  - `imageViaChat`：`request.image` 存在时 content 升级为多模态数组（text + image_url parts）——防止 chat 路径静默丢源图（i2i 退化 t2i）；对 seedream-4-5 无行为影响（chat 恒 fail → 回退）。

### Generator 本地真实 E2E（2026-07-22，本地网关 → 真实上游）

- t2i 回归（不带 image）：200 + 代理 URL 可解析 image/* ✅
- i2i URL 源图：200 + 代理 URL ✅，call_logs `source_images_count=1`、requestParams.image 为 `[image:url ...]` 占位符 ✅
- i2i base64 源图（115KB jpeg）：200 + 代理 URL ✅，requestParams.image 为 `[image:base64 115068B]` 占位符 ✅
- 计费：SUCCESS perCall 扣费（cost $0.0274 = ¥0.20×0.137，sell $0.03288 = ¥0.24×0.137）✅

**结论：seedream-4-5 i2i 探测通过，进入批次（capability `image_to_image` 待 F-IIV-07 provisioning）。**

---

## 2. F-IIV-05 — OpenRouter 图模探测（受阻，等用户裁决）

**探测时间：** 2026-07-22
**探测环境：** 生产 openrouter key，直连 `https://openrouter.ai/api/v1/chat/completions`，从 deploysvr 发起。

### 探测矩阵与结果

| # | 模型 | 源图形态 | 结果 |
|---|---|---|---|
| 1 | `openai/gpt-5-image` | URL | ❌ 402 Insufficient credits |
| 2 | `openai/gpt-5-image` | base64 | ❌ 402 Insufficient credits |
| 3 | `google/gemini-3-pro-image-preview` | URL | ❌ 402 Insufficient credits |
| 4 | `google/gemini-3-pro-image-preview` | base64 | ❌ 402 Insufficient credits |

### 受阻原因（非契约问题）

**OpenRouter 账户余额耗尽**：`/api/v1/credits` 返回 `total_credits=590, total_usage=590.20`（超支 $0.20）。廉价文本模型（deepseek-chat）同样 402——**全账户欠费，生产所有 OpenRouter 通道当前 402**（不止图模）。

**用户裁决（2026-07-22）：先跳过 F-IIV-05 等用户决定（充值后重探 / 或按 D5 收缩出批次）。**
i2i 上游契约（chat content 数组带 image_url）在余额恢复前无法验证；`openai-compat.ts imageViaChat` 的源图上送代码待探测通过后再落。

## 3. F-IIV-07 — provisioning 脚本用法 + 回滚

### 脚本用法

```bash
npx tsx scripts/provision-i2i-capabilities.ts            # dry-run（默认）：盘点 + 待补清单
npx tsx scripts/provision-i2i-capabilities.ts --apply    # 幂等写入 + 清 models:list* 缓存
```

- **TARGETS 清单**（脚本内常量）只准列入探测通过的模型；当前仅 `seedream-4-5`。
- gpt-5-image / gemini-3-pro-image 探测通过后（见 §2），把 alias 名追加进 TARGETS 重跑 `--apply` 即可（幂等）。
- 写入语义：alias `capabilities` **顶层 merge**（`{...现有键, image_to_image: true}`），保留既有键（含历史遗留的嵌套 `capabilities.capabilities` 结构，不动它）。
- 本地验证（2026-07-22，test DB）：dry-run 盘点 ✅ / apply merge 保留其他键 ✅ / 重跑幂等无变化 ✅ / 非 TARGETS 模型不误标 ✅。

### D8 存活性核验结论（2026-07-22）

| 写入路径 | 语义 | image_to_image 存活？ |
|---|---|---|
| 常规 model-sync（`model-sync.ts`） | 仅新建 model 时置 `{}`；已有 model 不碰 capabilities（:312 注释「admin-curated」）；alias 补推只针对 capabilities 为空的（:745-760） | ✅ 安全 |
| alias-classifier 常规同步（:354-366） | 「仅填充空值，不覆盖已有」（`!current.capabilities` 才写） | ✅ 安全 |
| `batchInferCapabilities`（:532-600） | 只处理 capabilities 为 null/空对象的 alias | ✅ 安全（脚本写入后即非空） |
| **`reinferAllCapabilities`**（:648-723，admin run-inference 触发的一次性迁移） | Step 2 对**所有** alias 用 LLM 推断**全量覆盖** capabilities（推断键清单不含 image_to_image） | ❌ **会抹掉** |

**⚠️ 运维铁则：任何人重跑 `reinferAllCapabilities`（admin「重新推断」）后，必须重跑 `npx tsx scripts/provision-i2i-capabilities.ts --apply` 恢复 i2i 标记。**（spec D8 决策：不改该一次性函数，以文档约束。）

### 生产 provisioning 步骤

```bash
# deploysvr 上（app 容器内跑，env 自带 DATABASE_URL/REDIS）：
cd /opt/apps/aigc-gateway
docker compose -f docker-compose.prod.yml exec app npx tsx scripts/provision-i2i-capabilities.ts          # 先 dry-run review
docker compose -f docker-compose.prod.yml exec app npx tsx scripts/provision-i2i-capabilities.ts --apply
```

### 回滚

```sql
-- 关闭某模型的 i2i 门禁放行（数据操作，无 schema 变更；改完清 models:list* 缓存或等 TTL）
UPDATE model_aliases
SET capabilities = capabilities || '{"image_to_image": false}'::jsonb
WHERE alias = 'seedream-4-5';
```

代码回滚：revert 本批次 commits 即可（无 DB migration）。

### 附：已知遗留（不阻断，建议后续批次处理）

- alias `seedream-4-5.capabilities` 存在历史双层嵌套（`{"capabilities": {...}, "supported_sizes": [...]}`），顶层键与嵌套键并存。本批次门禁只读顶层 `image_to_image`，不受影响；建议后续做一次 capabilities 结构清洗。
- `supported_sizes: ["1024x1024", ...]` 与实测不符（ep 要求 ≥3.68M 像素，1024x1024 恒被拒），见 §1 附带发现。
