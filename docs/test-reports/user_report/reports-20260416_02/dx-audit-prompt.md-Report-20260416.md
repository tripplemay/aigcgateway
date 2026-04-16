# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：dx-audit-prompt.md
---

所有关键数据已收集完毕。现在撰写完整报告。

---

# AIGC Gateway MCP 逆向工程与 DX 审计报告

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

本次审计共发现 **28 个 MCP Tools**，按功能域分类如下：

### 账户与项目管理（4 个）
| Tool | 作用 |
|---|---|
| `get_balance` | 查询用户余额，可附带最近 N 条流水（扣款/充值/调整） |
| `get_project_info` | 查看当前项目基本信息（名称、API 调用次数、Key 数量） |
| `create_project` | 创建新项目，并**静默替换**当前用户的默认项目 |
| `list_api_keys` / `create_api_key` / `revoke_api_key` | API Key 生命周期管理（列表、创建、吊销） |

### 模型与直接调用（3 个）
| Tool | 作用 |
|---|---|
| `list_models` | 列出所有可用 AI 模型，返回名称、品牌、价格、能力矩阵及图片尺寸 |
| `chat` | 向文本模型发送消息，支持流式、Function Calling、JSON 模式等 |
| `generate_image` | 调用图片模型生成图片，返回图片 URL |

### 可复用原子单元 Action（6 个）
| Tool | 作用 |
|---|---|
| `list_actions` | 列出项目所有 Action，含活跃版本摘要 |
| `get_action_detail` | 获取 Action 完整详情（活跃版本完整 messages/variables + 版本历史） |
| `create_action` | 创建新 Action（自动生成 v1 并设为活跃） |
| `update_action` | 修改 Action 元数据；改模型时自动创建新版本 |
| `create_action_version` | 为已有 Action 创建新版本（版本号自增，默认设为活跃） |
| `activate_version` | 切换 Action 的活跃版本（用于回滚/升级） |
| `run_action` | 执行 Action，支持变量注入、指定版本、`dry_run` 预览渲染 |
| `delete_action` | 删除 Action（被 Template 引用时阻止删除） |

### 多步工作流 Template（5 个）
| Tool | 作用 |
|---|---|
| `list_templates` | 列出项目所有 Template |
| `get_template_detail` | 获取 Template 完整详情（支持跨项目预览公共 Template） |
| `create_template` | 创建 Template，步骤按数组顺序排列，支持串行/Fan-out 模式 |
| `update_template` | 更新 Template 元数据或**全量替换**步骤 |
| `delete_template` | 删除 Template 及其所有步骤 |
| `run_template` | 执行 Template，支持全局/per-step 变量注入 |
| `list_public_templates` | 浏览管理员公开的模板库（含 fork 数、步骤数） |
| `fork_public_template` | 将公共 Template 及其 Actions 复制到本项目，创建独立副本 |

### 可观测性（3 个）
| Tool | 作用 |
|---|---|
| `list_logs` | 列出最近调用日志（支持按模型、状态、关键词、时间范围过滤） |
| `get_log_detail` | 通过 `traceId` 获取完整 prompt、response、参数、成本、延迟 |
| `get_usage_summary` | 汇总使用量，支持按模型/来源/Action/Template/天分组 |

---

## 第二步：系统能力逆向推演

### 平台性质

这是一个 **多模型 AI 服务聚合网关（AI API Aggregator / Proxy Gateway）**，商业逻辑与 OpenRouter、国内的硅基流动类似，但增加了更高层的「提示词管理」和「工作流编排」能力。

**核心商业逻辑三层架构：**

```
底层：原始模型调用（chat / generate_image）
         ↓
中层：可复用提示词单元（Action + 版本管理 + 变量模板）
         ↓
上层：多步工作流编排（Template = Action 串行 / Fan-out）
```

收费模式为**预付费余额扣款**，按 token 或按次计费，支持查询账单流水。目前接入了来自 OpenAI、Anthropic、Google、DeepSeek、ByteDance、百度、智谱、Moonshot、Minimax、Qwen、Xiaomi、xAI 等 **13 个品牌**的模型。

### 新开发者核心上手流程（Onboarding Workflow）

```
1. get_balance          → 确认余额可用
2. list_models          → 选择模型（含价格/能力/图片尺寸）
3. chat / generate_image → 直接调用模型，验证连通性
         ↓（进阶）
4. create_action        → 将常用 prompt 固化为 Action（含变量模板）
5. run_action(dry_run)  → 预览渲染效果（不计费）
6. run_action           → 正式执行，获取 traceId
7. create_template      → 将多个 Action 串联为工作流
8. run_template         → 一次触发多步执行
         ↓（运维）
9. list_logs / get_log_detail → 排查具体调用
10. get_usage_summary   → 统计用量与成本
```

---

## 第三步：极客视角的吐槽与建议

### BUG-01（Critical）：`list_actions` 与 `get_action_detail` 活跃版本数据不一致

**现象**：`list_actions` 报告 Action `DX审计-文章生成器` 的活跃版本为 **v5**（7个变量），但 `get_action_detail` 返回的 `activeVersion` 实际是 **v1**（4个变量），`versions` 数组中 `isActive: true` 也指向 v1。用 `dry_run` 验证，实际渲染的是 v1 的 messages。

**结论**：`list_actions` 的 `activeVersion.versionNumber` 字段存在脏数据，会让开发者误判当前活跃版本，在做版本管理决策时产生错误判断。

---

### BUG-02（High）：公共 Template 步骤编号乱序

**现象**：`list_public_templates` 中「严审版」Template 的步骤按 action 名称排列为：步骤1 → 步骤2 → **步骤4** → **步骤3.5** → **步骤3**。步骤 4 排在 3.5 之前，步骤 3.5 排在 3 之前，完全背离直觉。

**建议**：Template 步骤的 `order` 字段应自动按 action 名称中的数字或创建顺序校正，或在 UI/文档层提示 `order` 字段才是执行顺序的真相。

---

### DX-01（High）：`generate_image` 的 `size` 参数完全无约束，但正确值需从另一个 Tool 获取

**现象**：`generate_image` 的 `size` 参数 Schema 类型为 `string`，无 enum 约束，传入非法尺寸才会在运行时报错，此时费用已产生（或调用配额已消耗）。正确的可选值藏在 `list_models` 返回的 `supportedSizes` 中，需要开发者手动对应。

**建议**：  
① Schema 层面应将 `size` 改为 enum，或通过 `anyOf` 引用 `list_models` 返回的枚举值；  
② 或者在 `generate_image` 描述中明确写出「如传入不支持的尺寸将返回 4xx 错误，不扣费」，以消除开发者疑虑。

---

### DX-02（High）：错误信息多语言混乱，且缺少机器可读错误码

**现象**：三类已观测到的错误信息格式各异：
- **速率限制**：纯中文，无错误码，无 `retry-after` 建议 → `"您的账户已达到速率限制，请您控制请求频率"`
- **余额不足**：中英双语拼接，泄露内部充值 URL 结构 → `"账户余额过低...请前往 [URL removed] 充值。Your account balance is not sufficient..."`
- **模型不可用**：纯英文 → `"Model unavailable, please try list_models to find alternatives"`

**建议**：统一错误响应结构 `{ code: "RATE_LIMIT_EXCEEDED", message: "...", retryAfterMs: 60000 }`，语言由 `Accept-Language` 或接口参数控制；去除拼接的原始 provider 错误。

---

### DX-03（Medium）：`list_models` 不展示已下线但有历史调用的「幽灵模型」

**现象**：`get_usage_summary(group_by=model)` 返回了 `qwen-image`（6次成功）和 `claude-sonnet-4.6`（2次成功），但二者均不出现在 `list_models` 结果中。开发者查账单发现费用但找不到对应模型，无法理解成本归因。

**建议**：下线模型时，在 `list_models` 中保留一条 `deprecated: true` 状态的记录，并附带下线时间和替代模型建议；或在 `get_usage_summary` 结果中为历史模型标注 `[已下线]`。

---

### DX-04（Medium）：`list_logs` 缺少 `total` 分页信息，`latency` 是非结构化字符串

**现象**：  
① `list_logs` 响应中没有类似 `list_actions` 的 `pagination.total` 字段，开发者无法知道总日志条数，无法计算翻页策略。  
② `latency` 字段返回字符串 `"50.7s"` 而非数字毫秒值，无法直接做排序或数值过滤。

**建议**：增加 `pagination: { total, limit, offset }` 字段；将 `latency` 改为 `latencyMs: number` 整型字段。

---

### DX-05（Medium）：图片模型 `gemini-3-pro-image` capabilities 配置存在误导性字段

**现象**：`list_models(modality='image')` 中，`gemini-3-pro-image` 声明 `function_calling: true`、`json_mode: true`、`system_prompt: true`，但这些均是文本对话模型的能力，对图片生成模型没有语义意义，会误导开发者尝试向图片模型传 `tools` 参数。

**建议**：图片模型的 capabilities Schema 应是独立定义（如 `supports_image_editing`、`supports_negative_prompt`），不应复用文本模型的 capabilities 字段集。

---

### DX-06（Low）：`create_project` 无任何确认机制，静默替换全局默认项目

**现象**：调用 `create_project` 后，文档描述为「set it as the default project for this user」——即所有后续 API 调用会切换到新项目。这是一个高影响操作，但 Schema 中无任何确认提示，无法通过 `dry_run` 预览，也无法通过 `list_projects` 回查历史项目列表（该工具不存在）。

**建议**：增加 `list_projects` 和 `switch_project` 接口，使项目切换可观测、可撤销；或在 `create_project` 增加 `set_as_default: boolean` 参数（默认 false）。

---

### 安全观察（不计入 DX 评分，作为附加告警）

1. **历史日志记录了完整的注入测试 payload**（含 SQL 注入、PHP webshell、XSS、PE 文件 header、路径遍历），通过 `get_log_detail` 可完整读取。如日志 API 无权限隔离，任意有读日志权限的 Key 均可查看所有历史攻击载荷。

2. **`qwen-image` 模型（现已下线）曾成功处理含 SQL 注入 + XSS + PHP shell 的 prompt 并返回真实图片 URL**（`trc_s8xm6asif2e3krketbvxepcg`），且该 URL 暴露了底层基础设施提供商 `bizyair-prod.oss-cn-shanghai.aliyuncs.com`——成本显示 `$0.00000000`，存在计费漏洞的可能。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_actions",
      "description": "list_actions 返回的 activeVersion.versionNumber 与 get_action_detail 返回的 activeVersion.versionNumber 不一致，且 dry_run 实际渲染结果与 get_action_detail 一致，说明 list_actions 存在脏数据",
      "assertion": "对同一个 action_id：list_actions() 中该 action 的 activeVersion.versionNumber 必须等于 get_action_detail(action_id).activeVersion.versionNumber",
      "actual": "list_actions 报告活跃版本为 v5（7个变量），get_action_detail 返回 v1（4个变量）为活跃版本，dry_run 渲染结果与 v1 messages 吻合",
      "expected": "两个接口返回的活跃版本号应严格一致"
    },
    {
      "id": "DX-002",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "get_action_detail",
      "description": "get_action_detail 的 versions 数组中，isActive 标记与 list_actions 报告的活跃版本号相矛盾",
      "assertion": "get_action_detail(action_id).versions 数组中，有且仅有一项 isActive=true，且该项的 versionNumber 必须等于 get_action_detail(action_id).activeVersion.versionNumber",
      "actual": "versions 数组中 versionNumber=1 的条目 isActive=true，但 list_actions 报告的活跃版本号为 5",
      "expected": "isActive=true 的版本号应与 activeVersion.versionNumber 严格一致"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_public_templates",
      "description": "公共 Template「严审版」的步骤按 order 字段排列后，action 名称中的数字顺序为 1→2→4→3.5→3，违反直觉且疑似错误排序",
      "assertion": "list_public_templates 返回的 template steps，按 order 升序排列后，其 actionName 中包含的步骤序号应单调递增",
      "actual": "steps 按 order 排列：步骤1、步骤2、步骤4、步骤3.5、步骤3",
      "expected": "步骤按逻辑序号单调排列，如：步骤1、步骤2、步骤3、步骤3.5、步骤4"
    },
    {
      "id": "DX-004",
      "severity": "high",
      "category": "DX",
      "tool": "generate_image",
      "description": "generate_image 的 size 参数为自由文本，缺少 schema 层面的枚举约束，传入非法尺寸只能在运行时报错",
      "assertion": "generate_image(model='gpt-image', size='999x999', prompt='test') 必须返回 4xx 客户端错误，且错误信息中应说明合法尺寸范围",
      "actual": "size 参数 schema 类型为 string，无 enum，无 pattern，无最小/最大约束",
      "expected": "size 参数应有 enum 约束，或至少在描述中明确：非法尺寸将返回哪种错误码且不扣费"
    },
    {
      "id": "DX-005",
      "severity": "high",
      "category": "DX",
      "tool": "list_logs",
      "description": "list_logs 响应体缺少分页总数字段，开发者无法获知日志总条数，无法计算翻页",
      "assertion": "list_logs(limit=10, offset=0) 返回的响应体必须包含表示总日志条数的数字字段（如 total 或 pagination.total）",
      "actual": "响应体为日志数组，无任何分页元信息",
      "expected": "响应体应包含 pagination: { total: number, limit: number, offset: number }"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "DX",
      "tool": "list_logs",
      "description": "list_logs 中 latency 字段为带单位的字符串（如 \"50.7s\"），而非数字类型，无法直接进行数值排序或阈值过滤",
      "assertion": "list_logs 返回的每条日志中 latency 字段的类型必须为 number（毫秒），而非字符串",
      "actual": "latency 返回 \"50.7s\"（字符串）",
      "expected": "latency 应返回 50700（number，单位毫秒），或增加独立字段 latencyMs: number"
    },
    {
      "id": "DX-007",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "get_usage_summary(group_by='model') 返回了 qwen-image 和 claude-sonnet-4.6 的使用记录，但这两个模型在 list_models 中完全不存在",
      "assertion": "get_usage_summary(group_by='model').groups 中每个 key，必须能在 list_models() 返回的模型列表中找到对应的 name（允许标注 deprecated 状态，但必须存在）",
      "actual": "usage groups 包含 qwen-image（6次成功）和 claude-sonnet-4.6（2次成功），list_models 中均不存在这两个模型",
      "expected": "已下线模型应在 list_models 中以 deprecated:true 状态保留，或 usage_summary 中注明该模型已下线"
    },
    {
      "id": "DX-008",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "错误响应缺少机器可读的错误码字段，且多类错误消息语言不一致（中文/英文/双语混用）",
      "assertion": "chat() 触发速率限制、余额不足、模型不可用三类错误时，响应体必须均包含统一格式的 error_code 字段（如 RATE_LIMIT_EXCEEDED / INSUFFICIENT_BALANCE / MODEL_UNAVAILABLE）",
      "actual": "速率限制返回纯中文描述；余额不足返回中英双语拼接字符串；模型不可用返回纯英文",
      "expected": "所有错误均返回 { error_code: string, message: string } 结构，语言与请求 locale 一致"
    },
    {
      "id": "DX-009",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "速率限制错误不包含 retry-after 信息，开发者无法实现自动重试策略",
      "assertion": "chat() 触发速率限制错误时，响应必须包含 retryAfterMs 或 retryAfterSeconds 字段，告知最短等待时间",
      "actual": "错误信息仅为「您的账户已达到速率限制，请您控制请求频率」，无数值化等待时间",
      "expected": "应返回 retryAfterMs: number 字段，使调用方能实现指数退避重试"
    },
    {
      "id": "DX-010",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "图片模型 gemini-3-pro-image 声明了对图片生成模型无意义的文本能力字段（function_calling: true, json_mode: true, system_prompt: true）",
      "assertion": "list_models(modality='image') 返回的图片模型，其 capabilities 对象不应包含 function_calling、json_mode、system_prompt 等纯文本模型专属能力字段（或值应为 false）",
      "actual": "gemini-3-pro-image 的 capabilities: { function_calling: true, json_mode: true, system_prompt: true }",
      "expected": "图片模型能力字段应与文本模型分离，或至少这三个字段均为 false"
    },
    {
      "id": "DX-011",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "list_models 返回结果中仅部分模型（mimo系列）含有 description 字段，其余模型缺失，导致 schema 不一致",
      "assertion": "list_models() 返回的每个模型对象，必须均包含 description 字段（可为 null/空字符串，但字段必须存在）",
      "actual": "mimo-v2-flash、mimo-v2-omni、mimo-v2-pro 有 description 字段；其余 20 个模型均无此字段",
      "expected": "所有模型对象的顶层字段集合应一致，description 字段应对所有模型存在"
    },
    {
      "id": "SEC-001",
      "severity": "high",
      "category": "安全",
      "tool": "generate_image",
      "description": "历史日志显示含 SQL 注入、XSS、PHP webshell、路径遍历的 prompt 被 qwen-image 成功处理并返回图片 URL，且费用显示为 $0.00，疑似计费与内容过滤双重漏洞",
      "assertion": "generate_image(model=任意, prompt=包含 'SELECT * FROM' 或 '<script>' 或 '../../etc/passwd' 的字符串) 必须返回内容过滤错误（如 CONTENT_POLICY_VIOLATION），而非成功返回图片 URL",
      "actual": "traceId trc_s8xm6asif2e3krketbvxepcg：含完整注入 payload 的请求 status=success，返回真实图片 URL，cost=$0.00000000",
      "expected": "含明显注入特征的 prompt 应被内容安全层拦截，返回错误且不生成图片"
    },
    {
      "id": "SEC-002",
      "severity": "high",
      "category": "安全",
      "tool": "generate_image",
      "description": "图片生成成功时，返回的图片 URL 中包含底层基础设施提供商域名（bizyair-prod.oss-cn-shanghai.aliyuncs.com），造成后端供应链信息泄露",
      "assertion": "generate_image() 成功时返回的图片 URL 域名必须是 AIGC Gateway 自有域名或 CDN 域名，不得暴露底层 OSS / 云厂商域名",
      "actual": "返回 URL 前缀为 bizyair-prod.oss-cn-shanghai.aliyuncs.com，明确暴露了后端计算供应商和 OSS bucket 名称",
      "expected": "图片 URL 应通过 AIGC Gateway 自有域名代理或重写，隐藏底层存储供应商信息"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "generate_image",
      "description": "含恶意 payload 的图片生成请求 status=success（有真实图片产出），但 cost=$0.00000000，与同模型正常请求的 $0.00563015/张相差 100%",
      "assertion": "generate_image() 返回 status=success 且 response 包含有效图片 URL 时，cost 必须大于 0（大于等于 list_models 中对应模型的 pricing.perCall）",
      "actual": "traceId trc_s8xm6asif2e3krketbvxepcg：qwen-image 成功返回图片 URL，cost=$0.00000000",
      "expected": "成功生成图片时 cost 应等于 $0.00563015（与同模型其他成功调用一致）"
    },
    {
      "id": "DX-012",
      "severity": "low",
      "category": "DX",
      "tool": "create_project",
      "description": "create_project 会静默将新项目设为用户默认项目，但平台未提供 list_projects 或 switch_project，使项目切换不可回溯",
      "assertion": "调用 create_project() 后，必须存在 list_projects() 接口能列出用户所有项目，且 switch_project(project_id) 能切换默认项目",
      "actual": "list_projects 工具不存在；create_project 后无法回到原项目，也无法查询历史项目列表",
      "expected": "应提供 list_projects 接口，create_project 应支持 set_as_default: boolean 参数（默认 false）"
    },
    {
      "id": "DX-013",
      "severity": "low",
      "category": "DX",
      "tool": "update_template",
      "description": "update_template 的 steps 参数为全量替换，操作不可撤销，但与 run_action 不同，没有 dry_run 预览模式",
      "assertion": "update_template(template_id, steps=[...], dry_run=true) 必须返回步骤变更预览而不实际修改数据",
      "actual": "update_template 的 schema 中不存在 dry_run 参数",
      "expected": "高风险的全量替换操作应支持 dry_run 预览，与 run_action 保持一致的设计风格"
    }
  ]
}
```
