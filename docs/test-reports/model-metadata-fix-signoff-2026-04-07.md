# model-metadata-fix Signoff 2026-04-07

> 状态：**完成 Reverifying**（progress.json status=reverifying → done）
> 触发：F-MM-06 首轮 FAIL（capabilities/supportedSizes 缺失）修复后要求 Codex 复验。

---

## 变更背景
DX 审查报告给出 6 项批评：模型 capabilities 残缺、图片尺寸无提示、幽灵模型混入、image contextWindow 语义错误等。Generator 在 fix round #1 中加入输出层 fallback（`resolveCapabilities`/`resolveSupportedSizes`）、REST `/v1/models` 缓存改造，以及 SERVER_INSTRUCTIONS 文字更新，需要 Codex 复验。

---

## 变更功能清单

### F-MM-01：capabilities fallback 逻辑修复
**文件：**
- `src/app/api/v1/models/route.ts`
- `src/lib/mcp/tools/list-models.ts`

**改动：**
- 当 DB 中 `capabilities` 为空对象时，调用静态 `resolveCapabilities(model.name)` 自动补齐 function_calling/json_mode/streaming/vision。
- `/v1/models` 层新增 Redis singleflight 缓存，保证 fallback 计算只执行一次。

**验收标准：**
- `list_models`/`/v1/models` 中 `gpt-4o` 的 capabilities 至少包含 `function_calling: true`。
- 构造空 capabilities 数据时仍能得到完整标签。

### F-MM-02：generate_image size 参数提示
**文件：**
- `src/lib/mcp/tools/list-models.ts`
- `src/lib/mcp/tools/generate-image.ts`

**改动：**
- image 模型输出 `supportedSizes` 字段，数据来源静态映射。
- generate_image Tool 的 Schema description 明确“请先调用 list_models(modality='image') 查尺寸”。

**验收标准：**
- `list_models(modality='image')` 返回 `supportedSizes` 数组。
- Tool 描述文本提示参考 list_models。

### F-MM-03：幽灵模型状态管理
**文件：**
- `src/lib/mcp/tools/list-models.ts`
- `src/app/api/v1/models/route.ts`

**改动：**
- 仅输出 `enabled=true` 且存在 ACTIVE channel 的模型。
- 过滤健康检查连续 FAIL 的 channel。

**验收标准：**
- list_models 结果与 channel 启用状态一致，不包含下线模型。

### F-MM-04：image 模型 contextWindow 语义
**文件：**
- `src/lib/mcp/tools/list-models.ts`
- `src/app/api/v1/models/route.ts`

**改动：**
- image 模型强制 `contextWindow=null`，REST 层同理。

**验收标准：**
- 所有 image 模型 `contextWindow=null`。

### F-MM-05：SERVER_INSTRUCTIONS 更新
**文件：**
- `src/lib/mcp/server.ts`

**改动：**
- Quick Start、generate_image 等说明补充“list_models → supportedSizes”流程。

**验收标准：**
- MCP initialize 中的 instructions 已同步上述变更。

### F-MM-06：E2E 验证（executor: codex）
**文件：**
- `docs/test-reports/model-metadata-fix-reverify-2026-04-07.md`

**改动：**
- Codex 复验 L1 场景，记录实测输出。

**验收标准：**
- 1) gpt-4o capabilities 补全
- 2) image supportedSizes 存在
- 3) 无幽灵模型
- 4) image contextWindow=null
- 5) DX 吐槽（能力/尺寸/语义）与 SERVER_INSTRUCTIONS 闭环

---

## 未变更范围
| 事项 | 说明 |
|---|---|
| Provider adapter & 实际 sync | 本轮只修改输出层 fallback，未触碰 sync adapter；真实环境的幽灵模型需要上线后结合实际数据验证。 |

---

## 预期影响
| 项目 | 改动前 | 改动后 |
|---|---|---|
| MCP list_models 能力字段 | 多数模型 capabilities={} | fallback 自动补齐常用能力标签 |
| 图片尺寸提示 | 无结构化字段 | `supportedSizes` + Tool description 提示 |

---

## 类型检查
```
# 由 codex-setup.sh 触发
npm run build   # Next.js 14 build + ESLint + tsc 全部通过（仅有字体 Warning）
```

---

## Harness 说明
- 本批进入 `reverifying`，所有 F-MM-01~06 现均 PASS。
- `docs/test-reports/model-metadata-fix-reverify-2026-04-07.md` 记录复验细节，`docs/test-reports/model-metadata-fix-signoff-2026-04-07.md` 为签收文件。
- `progress.json` 将更新为 `status: "done"`，并引用本 signoff 路径。

---

## Framework Learnings
- 无新增。
