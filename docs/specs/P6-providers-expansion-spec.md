# P6 — 国产服务商扩展 Spec

## 背景与目标

当前已接入 7 家服务商（OpenAI / Anthropic / DeepSeek / Zhipu / Volcengine / SiliconFlow / OpenRouter），国产覆盖面不足。本批次新增 4 家国产 AI 服务商，扩大模型覆盖。

## 功能范围

新增 4 家服务商的 Sync Adapter + Provider 种子数据：

| 服务商 | Base URL | 认证方式 | Models API | 备注 |
|---|---|---|---|---|
| MiniMax | `https://api.minimax.io/v1` | Bearer | ✅ `/models` | penalty 参数被忽略 |
| Moonshot/Kimi | `https://api.moonshot.cn/v1` | Bearer | ✅ `/models` | K2.5 为最新模型 |
| 阿里云百炼/Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Bearer | ✅ `/models` | 通义千问全系 |
| 阶跃星辰/StepFun | `https://api.stepfun.com/v1` | Bearer | ✅ `/models` | Step 3.5 Flash 等 |

## 关键设计决策

1. **全部复用 `openai-compat` 引擎**，不写自定义 Engine Adapter
2. **Sync Adapter 遵循现有模式**（参考 `openai.ts` / `zhipu.ts`），每个 ~35 行
3. **Provider 记录通过 seed 脚本创建**（API Key 字段留空，管理员后续在 UI 填入）
4. **ProviderConfig 在 seed 中一并创建**，设置 `supportsModelsApi: true`

## 接口说明

无新增 API。现有 sync 流程（`/api/admin/sync`）自动覆盖新服务商。

## Adapter 代码模式

所有 4 个 adapter 遵循相同模式：

```typescript
export const xxxAdapter: SyncAdapter = {
  providerName: "xxx",
  filterModel(modelId) { return isChatModality(modelId); },
  async fetchModels(provider) {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    const json = await res.json();
    return (json.data ?? [])
      .filter(m => isChatModality(m.id))
      .map(m => ({
        modelId: m.id,
        name: `xxx/${m.id}`,
        displayName: m.id,
        modality: "TEXT" as const,
      }));
  },
};
```

## Seed 脚本说明

在 `prisma/seed.ts` 或单独脚本中，为每个服务商创建：
- Provider 记录（name, displayName, baseUrl, authType="bearer", adapterType="openai-compat"）
- ProviderConfig 记录（supportsModelsApi=true, chatEndpoint="/chat/completions"）
- API Key 留空（`authConfig: { apiKey: "" }`），管理员在 UI 中填入
