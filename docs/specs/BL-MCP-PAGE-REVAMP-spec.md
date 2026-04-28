# BL-MCP-PAGE-REVAMP — `/mcp-setup` 页面修正与增强

**批次类型：** UX 修正 + 功能增强
**创建：** 2026-04-28
**预计工时：** ~3.5h（4 features × 0.5-2h + 0.5h Codex 验收）
**来源：** 用户 2026-04-28 对话调研发现

---

## 背景

`/mcp-setup` 页面（`src/app/(console)/mcp-setup/page.tsx`，427 行）是 MCP 客户端接入文档页。Planner 调研发现：

### 严重问题（P0）
1. **Tool 清单 4/7 错误（57% 错误率）**：页面 hardcoded 7 个 tool，其中 4 个名字与后端不一致或不存在：
   - `chat_completion` → 实际是 `chat`
   - `get_context` / `token_count` / `verify_key` → **不存在**
   - `fetch_logs` → 实际是 `list_logs` + `get_log_detail`（两个）
2. **后端 28 个 tools 中 21 个未展示** — 包括最新交付的 `embed_text`（KOLMatrix 客户即将依赖）
3. **i18n 翻译键 `mcpSetup.toolXxx` 在 messages/{en,zh-CN}.json 完全缺失** — 渲染时显示 key 名而非描述

### 次要问题（P1-P2）
4. Step 编号视觉错位：1 → "Step 3" → 2（应是 1/2/3 顺序）
5. 缺乏 tool category 分组（一长串列表难扫读）
6. 缺 prompt 例子（用户不知道在 Claude Code 里如何调用）
7. 无 console 内 try-it（无法验证 MCP 工作）

### 业务影响
- KOLMatrix 客户接入 embed_text 时找不到文档
- 已有用户尝试 `verify_key` / `get_context` 等不存在 tool 调用失败找不到原因
- dogfood 体验质量差

---

## 完整 28 个 MCP Tool 清单（来自 `src/lib/mcp/server.ts`）

| Category | Tools |
|---|---|
| **模型查询** (1) | `list_models` |
| **AI 调用** (3) | `chat` / `generate_image` / **`embed_text`**（新） |
| **观察 / 计费** (4) | `list_logs` / `get_log_detail` / `get_balance` / `get_usage_summary` |
| **Action 工作流** (8) | `list_actions` / `get_action_detail` / `run_action` / `create_action` / `update_action` / `delete_action` / `create_action_version` / `activate_version` |
| **Template 工作流** (8) | `list_templates` / `get_template_detail` / `run_template` / `create_template` / `update_template` / `delete_template` / `list_public_templates` / `fork_public_template` |
| **API Keys** (3) | `list_api_keys` / `create_api_key` / `revoke_api_key` |
| **Projects** (2) | `get_project_info` / `create_project` |

总计 **28 个**（之前页面只展示 7 个）。

---

## F-MR-01（generator, ~1h）：动态 tool 清单 + i18n 补全

### 后端：`GET /api/mcp/tools`（新建）

返回所有已注册 tool 的 metadata，前端动态拉取替换 hardcoded 数组。

```ts
// 新建 src/app/api/mcp/tools/route.ts
GET /api/mcp/tools
Response: {
  data: Array<{
    name: string;          // 'list_models' / 'embed_text' / ...
    category: 'models' | 'ai_call' | 'observability' | 'action' | 'template' | 'api_key' | 'project';
    descriptionKey: string; // 'mcpSetup.toolListModels' (i18n key)
    icon: string;          // material-symbols 名字
  }>
}
```

**实现方式：** 用一个 const TOOL_REGISTRY 集中维护（避免运行时反射 mcp server 内部状态）：

```ts
// 新建 src/lib/mcp/tool-registry.ts
export const MCP_TOOL_REGISTRY = [
  { name: 'list_models', category: 'models', descriptionKey: 'mcpSetup.toolListModels', icon: 'list_alt' },
  { name: 'chat', category: 'ai_call', descriptionKey: 'mcpSetup.toolChat', icon: 'forum' },
  { name: 'generate_image', category: 'ai_call', descriptionKey: 'mcpSetup.toolGenerateImage', icon: 'image' },
  { name: 'embed_text', category: 'ai_call', descriptionKey: 'mcpSetup.toolEmbedText', icon: 'data_object' },
  // ... 28 个
] as const;
```

**测试：** 单测验证 28 个 tools 全在 + 与 server.ts 同步（一个 lint 测试：`expect(MCP_TOOL_REGISTRY.length).toBe(serverRegistrationCount)` — 通过 Comment 链接 server.ts 行号）。

### 前端：动态拉取替换 hardcoded

```tsx
// src/app/(console)/mcp-setup/page.tsx
// 删除 hardcoded 7 个 tool 数组（line 318-326）
// 改为：
const { data: tools } = useAsyncData<{ data: Tool[] }>(
  () => apiFetch('/api/mcp/tools'),
  []
);
```

### i18n 补全（`messages/en.json` + `messages/zh-CN.json`）

新增 `mcpSetup.toolXxx` × 28 + 7 个 category 标签：

```json
"mcpSetup": {
  // ... 已有 keys
  "toolListModels": { en: "Browse available models, prices, and capabilities", zh: "浏览可用模型、价格和功能" },
  "toolChat": { en: "Send chat messages to any text model", zh: "向文本模型发送对话消息" },
  "toolEmbedText": { en: "Generate vector embeddings (single or batch)", zh: "生成向量 embedding（单条或批量）" },
  "toolGenerateImage": { en: "Generate images from text prompts", zh: "根据文本生成图像" },
  "toolListLogs": { en: "List recent API call logs", zh: "列出最近 API 调用日志" },
  "toolGetLogDetail": { en: "View full call log + upstream raw payload", zh: "查看完整日志 + 上游原始响应" },
  "toolGetBalance": { en: "Check current account balance", zh: "查询当前账户余额" },
  "toolGetUsageSummary": { en: "30-day usage by model + cost breakdown", zh: "近 30 天用量按模型分布 + 费用拆解" },
  // Action 8 个
  "toolListActions": { en: "List Actions in current project", zh: "列出当前项目的 Actions" },
  "toolGetActionDetail": { en: "Get Action details + version history", zh: "查看 Action 详情 + 版本历史" },
  "toolRunAction": { en: "Run an Action by ID with variables", zh: "按 ID 运行 Action 并传入变量" },
  "toolCreateAction": { en: "Create a new Action with prompt + variables", zh: "创建新 Action（提示词 + 变量定义）" },
  "toolUpdateAction": { en: "Update Action metadata (name, description)", zh: "更新 Action 元数据（名称、描述）" },
  "toolDeleteAction": { en: "Delete an Action", zh: "删除 Action" },
  "toolCreateActionVersion": { en: "Create a new Action version", zh: "创建 Action 新版本" },
  "toolActivateVersion": { en: "Switch active Action version", zh: "切换 Action 活跃版本" },
  // Template 8 个 ...
  // API Keys 3 个 ...
  // Projects 2 个 ...
  
  // Categories
  "categoryModels": { en: "Model Discovery", zh: "模型查询" },
  "categoryAiCall": { en: "AI Calls", zh: "AI 调用" },
  "categoryObservability": { en: "Observability & Billing", zh: "观察与计费" },
  "categoryAction": { en: "Action Workflows", zh: "Action 工作流" },
  "categoryTemplate": { en: "Template Workflows", zh: "Template 工作流" },
  "categoryApiKey": { en: "API Key Management", zh: "API Key 管理" },
  "categoryProject": { en: "Project Management", zh: "项目管理" }
}
```

### Acceptance（F-MR-01）
- [ ] `GET /api/mcp/tools` 返 28 行 tool metadata，每行含 name/category/descriptionKey/icon
- [ ] `MCP_TOOL_REGISTRY` 与 `src/lib/mcp/server.ts` register 调用同步（28 = 28）
- [ ] 单测：registry 长度断言 + 每个 name 在 server.ts grep 命中
- [ ] 前端 hardcoded 数组删除，动态拉取生效
- [ ] i18n 35 个新 keys（28 tool desc + 7 category）en + zh 各添加
- [ ] tsc + build + vitest 全过

---

## F-MR-02（generator, ~30min）：Category 分组 + Step 编号修正

### Category 分组展示

7 个 category 按顺序分组（accordion 或 section header）：

```tsx
// 按 category 分组渲染
const groupedTools = useMemo(() => {
  const groups: Record<Category, Tool[]> = { models: [], ai_call: [], ... };
  tools.forEach(t => groups[t.category].push(t));
  return groups;
}, [tools]);

return (
  <>
    {CATEGORIES.map(cat => (
      <div key={cat}>
        <h4>{t(`category${capitalize(cat)}`)}</h4>
        {groupedTools[cat].map(tool => <ToolBadge ... />)}
      </div>
    ))}
  </>
);
```

### Step 编号修正

现状 line 311（"Step 3"）应是 Step 2 或独立 section。建议：
- Step 1: API Key
- Step 2: Client + Config
- 独立 section: "Available Tools"（无编号）

### Acceptance（F-MR-02）
- [ ] 7 category 按顺序展示 + i18n category 标签正确
- [ ] Step 编号视觉顺序为 1 → 2，无 "Step 3" 错位
- [ ] tsc + build 通过

---

## F-MR-03（generator, ~30min）：Prompt 例子

### 每 category 一段示例 prompt

在 category section 内加 "Example prompt"：

| Category | Example (zh-CN) | Example (en) |
|---|---|---|
| Models | 「列出所有可用的图像生成模型」 | "List all available image generation models" |
| AI Calls | 「用 gpt-5 把这段文字翻译成日语」 / 「用 bge-m3 计算 hello world 的 embedding」 | "Translate this text to Japanese using gpt-5" / "Compute embedding for 'hello world' using bge-m3" |
| Observability | 「查我账户余额」 / 「最近 5 次调用日志」 | "What's my balance" / "Show last 5 call logs" |
| Action | 「跑 Action kol-email-customize 给变量 kol_name='Tom'」 | "Run Action kol-email-customize with variable kol_name='Tom'" |
| Template | 「用 weekly-report-for-client 模板生成本周报告」 | "Generate this week's report using weekly-report-for-client template" |
| API Key | 「创建一个名为 'KOLMatrix Bot' 的 API Key」 | "Create an API key named 'KOLMatrix Bot'" |
| Project | 「查看当前项目信息」 | "Show current project info" |

i18n keys：`mcpSetup.exampleModels` / `exampleAiCall` 等 7 个。

### Acceptance（F-MR-03）
- [ ] 每 category 显示 1 段示例（中英双语）
- [ ] i18n 14 个新 keys（7 category × 2 lang）
- [ ] 视觉：example 用 quote 样式（左 border + italic），与 tool list 区分

---

## F-MR-04（generator, ~1.5h）：Try-it 面板（仅安全 tools）

### Scope: 仅 4 个安全 tool 可在 console 内试用

为避免试用动作产生计费 / 副作用，仅支持 read-only 或最低成本 tool：

| Tool | 安全等级 | 实现方式 |
|---|---|---|
| `list_models` | ✓ 完全免费 read | 调内部 `/api/v1/models` |
| `get_balance` | ✓ 完全免费 read | 调内部 `/api/users/me/balance` |
| `get_usage_summary` | ✓ 完全免费 read | 调内部 `/api/users/me/usage` |
| `embed_text` | ✓ 极低成本（~$0.000004） | 调内部 `/api/v1/embeddings` (model 锁定 bge-m3) |

**显式排除：** `chat`（按 token 计费可能贵）/ `generate_image`（每张 ~$0.04）/ `run_action` / `run_template`（用户级业务影响）/ create/update/delete 系列（不可逆）。这些只在 tool description 里展示，不允许 try-it。

### UI 设计

新增 SectionCard "Try It"（在 tool list 之后），包含：

```tsx
// 简化版 spec（generator 实施时可调整）
<SectionCard title={t('tryItTitle')}>
  {/* Tool dropdown — 仅 4 个安全 tools */}
  <select value={toolName} onChange={...}>
    <option value="list_models">list_models</option>
    <option value="get_balance">get_balance</option>
    <option value="get_usage_summary">get_usage_summary</option>
    <option value="embed_text">embed_text</option>
  </select>
  
  {/* 参数表单（按选中 tool 动态） */}
  {toolName === 'list_models' && <select for modality></select>}
  {toolName === 'embed_text' && <textarea for input></textarea>}
  {/* get_balance / get_usage_summary 无参数 */}
  
  {/* Run button */}
  <Button onClick={runToolViaInternalApi}>Run</Button>
  
  {/* Response display */}
  <pre>{JSON.stringify(response, null, 2)}</pre>
</SectionCard>
```

### 后端复用

不新建 try-it 专用 endpoint — 复用现有内部 API：
- `list_models` → `GET /api/v1/models?modality=...`
- `get_balance` → `GET /api/users/me/balance`（已有）
- `get_usage_summary` → `GET /api/users/me/usage` （已有，可能需 30-day filter）
- `embed_text` → `POST /api/v1/embeddings`（用当前用户 API key）

前端通过 `apiFetch`（已有 helper）+ user session cookie 调用，无需 API key 输入。

### Acceptance（F-MR-04）
- [ ] Try-it 面板 4 个 tool 可选 + 参数表单动态变化
- [ ] list_models try-it 返回 modality 过滤后的 models 列表
- [ ] get_balance try-it 显示当前余额（与 sidebar 余额一致）
- [ ] get_usage_summary try-it 显示 30 天 usage breakdown
- [ ] embed_text try-it（model=bge-m3 锁定）输入文本 → 返回 1024 维向量首 5 维 + dimensions
- [ ] 错误处理：embed_text 余额不足 → toast error，不崩溃
- [ ] 视觉：响应区域 JSON 格式化 + 滚动；超长截断（max-height 400px）
- [ ] tsc + build + vitest 全过

---

## F-MR-05（codex, ~30min）：全量验收

### 静态（3）
1. tsc / build / vitest（基线 516 + F-MR-01 新增 ≥ 1 = ≥ 517）

### API（3）
2. `GET /api/mcp/tools` 返 28 行 + 字段完整
3. 每 tool name 在 `src/lib/mcp/server.ts` register 调用中能 grep 到（lint 一致性）
4. embed_text 在 registry 中

### 前端（5）
5. 访问 `/mcp-setup` → 7 category 按顺序展示，每 category 至少 1 个 tool
6. 共显示 28 个 tool（区别于之前 7 个）
7. embed_text 显示在 "AI 调用" category
8. Step 编号视觉 1 → 2（无 "Step 3"）
9. 切 zh-CN 后 tool desc + category 全部中文（无 i18n key 漏底）

### Try-it（3）
10. 选 list_models + modality=image → 返回 image 模型列表（≥ 1 行）
11. 选 embed_text + input='hello' → 返回 dimensions=1024 + 向量前 5 维
12. 选 get_balance → 显示当前余额（与 sidebar 一致）

### 报告（1）
13. `docs/test-reports/BL-MCP-PAGE-REVAMP-signoff-2026-04-2X.md`，含 12 项证据 + 关键截图（前后对比 / try-it 截屏）

---

## 非目标 / Phase 2

- ❌ 不做 chat / generate_image / run_action 的 try-it（计费 / 副作用大）
- ❌ 不做 create/update/delete 系 tool 的 try-it（不可逆）
- ❌ 不做 MCP 协议层试用（直接发 JSON-RPC 包到 /api/mcp）— 复杂度高，下期视情况
- ❌ 不重构客户端配置生成函数（10 种客户端配置已正确）
- ❌ 不改变 URL `https://aigc.guangai.ai/mcp`

## Risks

| 风险 | 缓解 |
|---|---|
| MCP_TOOL_REGISTRY 与 server.ts 漂移（未来加 tool 漏更新 registry）| 单测断言 length 一致 + 加 doc comment 提示「加 tool 必须同步 2 处」；Phase 2 可考虑反射 server 内部 _registeredTools |
| Try-it embed_text 真扣费用（每次 ~$0.000004） | 文案明示「将产生微量费用」；rate limit 让用户不能恶意点 100 次（已有项目级 rate limit 兜底） |
| i18n 35 个新 keys 翻译不准 | 中英文 spec 给了具体文案，generator 直接用；中文优先（KOLMatrix 客户中文） |
| 前端 hardcoded → API 切换可能 hydration mismatch | 用 useAsyncData（项目已有 hook，处理 loading state） |

## 部署

- 单 commit + 部署即生效（无 migration / 配置变更）
- 回滚：revert commit

## 验收标准

- [ ] F-MR-05 的 13 项全 PASS
- [ ] tsc / build / vitest（≥ 517）全过
- [ ] 28 个 tool 正确显示 + i18n 双语 + 4 个 try-it 工作
- [ ] signoff 报告归档
- [ ] KOLMatrix 收到通知「embed_text 已在 mcp-setup 页面文档化 + 可 try-it」
