# BL-SYNC-ADAPTERTYPE-FALLBACK — 模型同步按 adapterType 回退（修复后台新增 provider 无法同步）

**批次类型：** Bug 修复 / 设计缺口修复
**创建日期：** 2026-07-03
**触发：** 生产新增 provider `guangtech` 模型同步失败

---

## 1. 背景与根因

后台新增的 provider `guangtech`（baseUrl `https://co.ghgame.cn:18065/v1`，authType bearer，adapterType `openai-compat`，apiKey 已配）模型同步失败。生产日志：

```
[model-sync] guangtech: FAIL 0 models (API: 0) error: No sync adapter found for provider "guangtech"
```

**根因：** 同步引擎 `src/lib/sync/model-sync.ts:553` 只按 `provider.name` 从硬编码 `ADAPTERS` 注册表（12 个内置 provider 名）查找适配器，**完全不读 `provider.adapterType` 字段**。后台 UI 允许创建任意 name + adapterType 的 provider，但同步后端只认那 12 个写死的名字 → 任何后台新增 provider 都会在"查找适配器"这一步直接失败，根本到不了上游 API。

`adapterType`（默认 `openai-compat`）目前是同步路径上的"死数据"。

**已验证：** guangtech 的 `/v1/models` 用真实 key 返回 HTTP 200 + 标准 OpenAI 格式 `{data:[{id,object,display_name}]}`（gpt-5.5 / gpt-5.4 / gpt-5.3-codex 等）。是标准 OpenAI 兼容端点，通用适配器可直接消费，无需 staticModels。

## 2. 目标

1. guangtech 模型同步成功，导入其 `/models` 返回的 chat 模型（命名 `guangtech/<modelId>`）。
2. **通用修复**：以后从后台 UI 新增的任何 `adapterType=openai-compat` 的 provider 均可自动同步，无需再改代码 / 发版。
3. 让 `adapterType` 字段在同步派发中真正生效，且**不改动任何现有 12 个内置 provider 的行为**。

## 3. 功能范围

**In scope：**
- 新增通用 OpenAI 兼容同步适配器（动态以 `provider.name` 作模型名前缀）。
- 同步引擎派发逻辑：`ADAPTERS[provider.name]` 未命中时，按 `provider.adapterType` 回退到通用适配器。
- 优化"无适配器"错误信息（带上 adapterType，便于诊断）。

**Out of scope：**
- 不改任何现有 named 适配器（deepseek/zhipu/qwen/minimax/openrouter/siliconflow/volcengine/xiaomi-mimo/openai/anthropic/moonshot/stepfun）。
- 不改后台 provider 表单 / UI。
- 不处理 xiaomi-mimo 401（独立问题，另行跟进）。
- 不引入 staticModels 兜底（guangtech /models 正常，无需）。

## 4. 关键设计决策

**D1 — 派发按 name 优先、adapterType 回退：**
```ts
const adapter = ADAPTERS[provider.name] ?? ADAPTERS_BY_TYPE[provider.adapterType];
```
- name 命中 → 沿用现有 named 适配器（含各自 NAME_MAP / 白名单），**现有行为零变化**。
- name 未命中但 `adapterType` 命中（当前仅 `"openai-compat"`）→ 用通用适配器。
- 两者都未命中 → 保持原有失败结果，错误信息补充 adapterType。

**D2 — 通用适配器用动态前缀：** 现有 named 适配器把模型名前缀写死（`openai/`、`deepseek/`）。通用适配器必须用 `provider.name` 作前缀（`${provider.name}/${modelId}`），否则不同 provider 会撞名。

**D3 — ADAPTERS_BY_TYPE 只映射 `openai-compat`：** siliconflow / volcengine 这类特殊 adapterType 已有 name 键适配器优先命中；它们的 named 适配器前缀写死，不适合给异名 provider 复用。故 by-type 表只保留 `openai-compat → 通用适配器`，其余未知 adapterType 仍走失败分支（我们确实不知道怎么对话）。

**D4 — 通用适配器实现对齐 openai 适配器：** GET `${baseUrl}/models` + `Bearer` key，解析 `json.data`，`filterModel = isChatModality`，`modality = inferModality(id)`，`displayName = upstream.display_name ?? id`。复用 base.ts 现有 helper（fetchWithTimeout / requireApiKey / getBaseUrl / inferModality / isChatModality）。

## 5. 涉及文件

| 文件 | 变更 |
|---|---|
| `src/lib/sync/adapters/openai-compat.ts` | **新增** 通用 OpenAI 兼容适配器（动态前缀） |
| `src/lib/sync/model-sync.ts` | import 通用适配器；新增 `ADAPTERS_BY_TYPE`；派发行 `553` 加 adapterType 回退；错误信息补 adapterType |

## 6. 验收要点（Codex L2）

1. 生产触发一次模型同步，`guangtech` 从 FAIL 变 OK，导入 N（>0）个模型，channel 生成。
2. 其余 provider（deepseek/zhipu/qwen/siliconflow/volcengine/openrouter/minimax）同步结果与本批次前一致（无回归、无模型名变化）。
3. guangtech 模型命名为 `guangtech/<modelId>`，modality 正确。
4. 单测覆盖派发解析（name 优先 / adapterType 回退 / 未知 → 失败）+ 通用适配器映射（动态前缀 / json.data 解析 / 非 chat 过滤）。
5. `npx tsc --noEmit`（以 CI typecheck 为准）/ `npm run build` PASS。
