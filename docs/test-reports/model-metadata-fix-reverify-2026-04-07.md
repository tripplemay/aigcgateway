# model-metadata-fix — L1 Reverify Report (2026-04-07)

## 环境
- `bash scripts/test/codex-setup.sh` / `codex-wait.sh`（L1 localhost:3099）
- 额外注入模型：直接往 Postgres `models`/`channels` 表写入 gpt-4o、gpt-4o-mini、dall-e-3、gpt-image-1、seedream-4.5、cogview-3，保持 `capabilities={}` 以验证 fallback。Channels 设为 `ACTIVE` 并插入 `health_checks`=PASS，避免健康检查过滤。
- 测试账号：`codextra1775569400@test.local`（通过 API 创建项目 + API Key，余额手动调至 $100）

## 用例与结果
| ID | 验收点 | 结论 | 证据 |
|----|--------|------|------|
| F-MM-06-01 | `list_models` 中 gpt-4o capabilities 包含 function_calling/json_mode/streaming/vision | ✅ PASS | MCP Tool 响应片段（见下方）显示 `"capabilities": { "vision": true, "json_mode": true, "streaming": true, "function_calling": true }` |
| F-MM-06-02 | image 模型返回 `supportedSizes` | ✅ PASS | 同一响应中 `dall-e-3` / `gpt-image-1` / `seedream-4.5` / `cogview-3` 均带 `supportedSizes` 数组 |
| F-MM-06-03 | image 模型 `contextWindow=null` | ✅ PASS | `contextWindow` 字段为 `null`，REST `/v1/models` 也一致 |
| F-MM-06-04 | REST `/v1/models` 输出与 MCP 对齐（价格/能力/尺寸字段同步） | ✅ PASS | `curl http://localhost:3099/v1/models` 返回 6 个模型，字段与 MCP 一致，支持 `supported_sizes` 与 capability fallback |
| F-MM-06-05 | DX Audit 吐槽 1/2/6 修复验证 | ✅ PASS（局部） | ① capabilities 补齐；② size 提示：`generate_image` Schema description 改为“Check supportedSizes in list_models(modality='image')…”；⑥ image contextWindow=null。其余吐槽（幽灵模型、错误标准化）受限于本地无真实 provider，未在本轮 L1 复现 |

> 未验证项：DX 报告中“幽灵模型不再出现”需在真实 sync 数据下确认；`generate_image` 非法 size 的错误消息因缺少第三方 key 仍返回 `provider_error`，无法观测新的友好提示。

## 关键响应
### MCP `list_models`
```
[
  {
    "name": "cogview-3",
    "modality": "image",
    "contextWindow": null,
    "capabilities": {"streaming": false},
    "supportedSizes": ["1024x1024"]
  },
  {
    "name": "dall-e-3",
    "modality": "image",
    "contextWindow": null,
    "supportedSizes": ["1024x1024","1024x1792","1792x1024"]
  },
  {
    "name": "gpt-4o",
    "modality": "text",
    "contextWindow": 128000,
    "capabilities": {
      "vision": true,
      "json_mode": true,
      "streaming": true,
      "function_calling": true
    }
  },
  {
    "name": "gpt-4o-mini",
    "modality": "text",
    "contextWindow": 128000,
    "capabilities": {
      "vision": true,
      "json_mode": true,
      "streaming": true,
      "function_calling": true
    }
  },
  {
    "name": "gpt-image-1",
    "modality": "image",
    "contextWindow": null,
    "supportedSizes": ["1024x1024","1024x1536","1536x1024","auto"]
  },
  {
    "name": "seedream-4.5",
    "modality": "image",
    "contextWindow": null,
    "supportedSizes": ["1024x1024","960x1280","1280x960","720x1440","1440x720"]
  }
]
```

### REST `/v1/models`
```
{
  "data": [
    {
      "id": "gpt-4o",
      "context_window": 128000,
      "pricing": {"input_per_1m": 3, "output_per_1m": 12},
      "capabilities": {"vision": true, "json_mode": true, "streaming": true, "function_calling": true}
    },
    {
      "id": "gpt-image-1",
      "supported_sizes": ["1024x1024","1024x1536","1536x1024","auto"],
      "capabilities": {"streaming": false}
    },
    ...
  ]
}
```

## 结论
- `list_models`/`/v1/models` 均已通过 capabilities fallback + supportedSizes 输出，image contextWindow 维持 null。
- DX 报告中关于能力缺失、size 不透明、contextWindow 错位的吐槽已闭环；幽灵模型 & 错误标准化仍需线上数据验证。
- 建议后续在具备 provider 凭据的环境（或 mock adapter）补测 `generate_image` size 错误提示、以及 `get_usage_summary` 与历史模型对比场景。
