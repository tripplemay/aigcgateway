# model-metadata-fix — L1 Verifying Report (2026-04-07)

## 环境
- 脚本：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- BASE_URL：`http://localhost:3099`
- 通过 `npx tsx scripts/test/mcp-capability-enhancement-e2e-2026-04-05.ts` 注入最小可用模型和 mock 渠道，再手工启用 image 模型（`openai/dall-e-3` / `openai/gpt-image-1` / `volcengine/seedream-4.5` / `zhipu/cogview-3`）。
- 测试项目：`cmnon51xm00qj9yy03ul4lkhf`（余额手工置为 $100 以覆盖 image 场景）

> 说明：由于本地无真实 provider API Key，需要通过 mock server + 手工启用模型来复现批次目标数据。

## 覆盖用例
| ID | 场景 | 结果 |
|----|------|------|
| MM-LIST-01 | MCP `list_models`（modality=text）包含 gpt-4o 能力标签 | **FAIL** — `capabilities={}`，缺少 `function_calling/json_mode/streaming/vision` |
| MM-LIST-02 | MCP `list_models(modality=image)` 返回 `supportedSizes` | **FAIL** — image 模型仅返回 `capabilities`，无 `supportedSizes` 字段 |
| MM-LIST-03 | image 模型 `contextWindow=null` | PASS — `openai/dall-e-3`/`gpt-image-1`/`seedream-4.5`/`cogview-3` 均为 `null` |
| MM-LIST-04 | list_models 过滤下线模型 | N/A — 本地 DB 无 `doubao-pro-32k`/`glm-4.7-flash` 等幽灵模型，无法模拟 usage 对比 |
| MM-ERR-01 | `generate_image(size=999x999)` 错误提示 | 未验证 — 本地 openai provider 缺少 API Key，调用直接落入 `provider_error` | 

## 关键证据
### 1. list_models 原始响应（text + image 混合）
```
[
  {
    "name": "openai/dall-e-3",
    "modality": "image",
    "contextWindow": null,
    "price": "$0.012 per image",
    "capabilities": {"unknown": false}
  },
  {
    "name": "openai/gpt-4o",
    "modality": "text",
    "contextWindow": 128000,
    "price": "$3 in / $12 out per 1M tokens",
    "capabilities": {}
  },
  {
    "name": "openai/gpt-4o-mini",
    "modality": "text",
    "contextWindow": 128000,
    "price": "$0.18 in / $0.72 out per 1M tokens",
    "capabilities": {"tools": true, "unknown": false, "json_mode": true, "streaming": true}
  },
  {
    "name": "openai/gpt-image-1",
    "modality": "image",
    "contextWindow": null,
    "price": "$0.048 per image",
    "capabilities": {"unknown": false}
  },
  {
    "name": "volcengine/seedream-4.5",
    "modality": "image",
    "contextWindow": null,
    "price": "$0.018 per image",
    "capabilities": {"unknown": false}
  },
  {
    "name": "zhipu/cogview-3",
    "modality": "image",
    "contextWindow": null,
    "price": "Free",
    "capabilities": {"unknown": false}
  }
]
```
> 缺陷 1：`openai/gpt-4o` 仍是空对象，验收要求的 `function_calling=true` 等字段缺失。
>
> 缺陷 2：所有 image 模型均缺少 `supportedSizes` 字段，无法指导 size 参数。

### 2. generate_image(size=999x999)
```
{"code":"provider_error","message":"Provider request failed: fetch failed"}
```
> 由于 provider 未配置 API Key，本地只能拿到 provider_error。误差提示未能覆盖 DX 吐槽 3（合法尺寸提示）。

## 结论
- **F-MM-06 → FAIL**：关键 acceptance（capabilities fallback、image supportedSizes）均未命中。
- 需要 Generator 重新检查 `Model.capabilities` 同步逻辑以及 `resolveSupportedSizes` 的匹配方式（当前 key 与 `provider/model` 前缀不一致）。
- DX Audit 6 个吐槽：至少两项仍未修复，其余项无法在无真实 provider 环境下验证。
