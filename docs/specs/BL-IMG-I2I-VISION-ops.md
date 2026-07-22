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

## 2. F-IIV-05 — OpenRouter 图模探测（待补）

## 3. F-IIV-07 — provisioning 脚本用法 + 回滚（待补）
