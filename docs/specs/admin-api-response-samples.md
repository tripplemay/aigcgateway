# 管理端接口真实响应样例

采样时间：`2026-04-05`  
采样环境：生产环境 `https://aigc.guangai.ai`  
鉴权方式：JWT Admin（Bearer token）  
原始采样文件目录：`docs/test-reports/dev-infra-api-samples/`

说明：
- 下列 JSON 均来自生产环境真实调用，不是 mock。
- 对超大响应仅保留真实结构中的代表性片段，字段名与字段类型未改写。

## GET /api/admin/models-channels

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
```json
{
  "data": [
    {
      "id": "cmnckvuxw000sn56irlkhle5s",
      "name": "anthropic",
      "displayName": "Anthropic Claude",
      "summary": {
        "modelCount": 4,
        "activeChannels": 0,
        "degradedChannels": 0,
        "disabledChannels": 4
      },
      "models": [
        {
          "id": "cmngpmvr50000rn9xouywjkkc",
          "name": "anthropic/claude-haiku-4-5-20251001",
          "displayName": "Claude Haiku 4.5",
          "modality": "TEXT",
          "contextWindow": null,
          "healthStatus": "unknown",
          "sellPrice": null,
          "channels": [
            {
              "id": "cmngpmvrf0002rn9x9cdud1ov",
              "realModelId": "claude-haiku-4-5-20251001",
              "priority": 1,
              "costPrice": {
                "unit": "token",
                "inputPer1M": 1,
                "outputPer1M": 5
              },
              "sellPrice": {
                "unit": "token",
                "inputPer1M": 1.2,
                "outputPer1M": 6
              },
              "sellPriceLocked": false,
              "status": "DISABLED",
              "latencyMs": null,
              "successRate": null,
              "totalCalls": 0
            }
          ]
        }
      ]
    }
  ]
}
```

**关键字段说明：**
- `data`：按 provider 聚合后的管理端展示结果。
- `summary`：该 provider 下模型数与通道状态汇总。
- `models[].modality`：模型模态，例如 `TEXT`、`IMAGE`。
- `models[].healthStatus`：模型级健康状态聚合结果。
- `channels[].realModelId`：实际向上游 provider 调用的真实模型 ID。
- `channels[].sellPrice` / `costPrice`：销售价与成本价配置。

## GET /api/admin/usage?from=2026-04-01T00:00:00Z&to=2026-04-06T00:00:00Z

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
```json
{
  "period": "7d",
  "totalCalls": 30,
  "totalTokens": 326,
  "totalRevenue": 0.14414272,
  "totalCost": 0.1201176,
  "margin": 0.024025119999999997,
  "avgLatencyMs": 6371,
  "successRate": 0.8
}
```

**关键字段说明：**
- `period`：聚合周期标识。
- `totalCalls`：时间窗口内总调用数。
- `totalTokens`：总 token 数；纯图片调用可能为 `0`。
- `totalRevenue` / `totalCost` / `margin`：收入、成本与毛利。
- `avgLatencyMs`：聚合平均耗时，单位毫秒。
- `successRate`：成功率，范围 `0 ~ 1`。

## GET /api/admin/usage/by-model?from=2026-04-01T00:00:00Z&to=2026-04-06T00:00:00Z

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
```json
{
  "data": [
    {
      "model": "openai/dall-e-3",
      "calls": 4,
      "tokens": 0,
      "cost": 0.12,
      "revenue": 0.144,
      "avgLatency": 8551
    },
    {
      "model": "deepseek/v3",
      "calls": 14,
      "tokens": 326,
      "cost": 0.0001176,
      "revenue": 0.00014272,
      "avgLatency": 1903
    }
  ]
}
```

**关键字段说明：**
- `data`：按模型聚合的用量数组。
- `model`：路由层统一模型名。
- `calls`：该模型调用次数。
- `tokens`：该模型总 token 数；图片模型可能为 `0`。
- `cost` / `revenue`：该模型聚合成本与收入。
- `avgLatency`：该模型平均耗时，单位毫秒。

## GET /api/admin/sync-status

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
```json
{
  "data": {
    "lastSyncTime": "2026-04-05T00:36:13.993Z",
    "lastSyncResult": {
      "startedAt": "2026-04-05T00:34:21.693Z",
      "finishedAt": "2026-04-05T00:36:13.993Z",
      "durationMs": 112344,
      "providers": [
        {
          "provider": "deepseek",
          "success": true,
          "apiModels": 0,
          "modelCount": 2
        }
      ],
      "summary": {
        "totalProviders": 6,
        "totalSuccessfulProviders": 6,
        "totalFailedProviders": 0
      }
    },
    "zeroPriceActiveChannels": 58,
    "lastSyncAt": "2026-04-05T00:36:13.993Z",
    "lastSyncDuration": 112.3,
    "lastSyncResultStatus": "success"
  }
}
```

**关键字段说明：**
- `lastSyncTime`：历史保留字段，表示最近一次同步时间。
- `lastSyncResult`：原始同步结果对象，包含 provider 级明细与 summary。
- `zeroPriceActiveChannels`：当前 `ACTIVE` 且售价为 0 的 channel 数量。
- `lastSyncAt`：最近一次同步完成时间，ISO 8601。
- `lastSyncDuration`：最近一次同步耗时，单位秒。
- `lastSyncResultStatus`：从同步 summary 归纳出的结果状态。

## GET /api/admin/health

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
```json
{
  "summary": {
    "active": 191,
    "degraded": 0,
    "disabled": 9,
    "total": 200
  },
  "data": [
    {
      "channelId": "cmngpmvrf0002rn9x9cdud1ov",
      "provider": "Anthropic Claude",
      "providerName": "anthropic",
      "model": "anthropic/claude-haiku-4-5-20251001",
      "modelDisplayName": "Claude Haiku 4.5",
      "modality": "TEXT",
      "realModelId": "claude-haiku-4-5-20251001",
      "status": "DISABLED",
      "priority": 1,
      "lastChecks": [],
      "lastCheckedAt": "2026-04-05T00:10:36.426Z",
      "consecutiveFailures": 3
    }
  ]
}
```

**关键字段说明：**
- `summary`：通道健康状态总览。
- `data`：逐 channel 的健康检查结果数组。
- `lastChecks`：最近几次健康检查明细。
- `lastCheckedAt`：该 channel 最近一次健康检查时间。
- `consecutiveFailures`：连续失败次数。
- `status`：channel 当前状态，如 `ACTIVE`、`DISABLED`。
