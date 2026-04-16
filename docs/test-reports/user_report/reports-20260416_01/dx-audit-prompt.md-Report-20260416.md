# 审计执行报告
> **审计时间**：2026-04-16 03:42:00 (UTC+8)
> **审计角色**：dx-audit-prompt.md
---

数据收集完毕，已积累足够证据。现在撰写完整审计报告。

---

# AIGC Gateway MCP 端点 DX 审计报告

**审计日期：** 2026-04-16  
**审计范围：** 全量 MCP Tool Schema + 实际调用返回值  
**项目：** admin_test1 | API Base: `https://aigc.guangai.ai/v1`

---

## 第一步：全量资产盘点

共发现 **29 个 MCP Tools**，按功能域分组如下：

| 功能域 | Tool 列表 | 职责说明 |
|--------|-----------|----------|
| **账户 & 项目** | `get_balance`, `get_project_info`, `create_project` | 查余额（含交易流水）、查项目元数据、创建新项目并设为默认 |
| **模型目录** | `list_models` | 按模态（text/image）和能力过滤，返回名称、品牌、价格、capabilities、supportedSizes |
| **对话生成** | `chat` | 多模型文本对话，支持流式/JSON Mode/Function Calling/采样参数 |
| **图片生成** | `generate_image` | 文生图，size 需从 supportedSizes 选取 |
| **Action CRUD** | `create_action`, `update_action`, `delete_action`, `get_action_detail`, `list_actions` | 原子执行单元管理，绑定模型+提示词模板+变量定义 |
| **Action 版本** | `create_action_version`, `activate_version` | 版本化管理，支持版本回滚/升级 |
| **Template 编排** | `create_template`, `update_template`, `delete_template`, `list_templates`, `get_template_detail`, `run_template` | 多步工作流，支持串行和 Fan-out（SPLITTER→BRANCH→MERGE）模式 |
| **公共模板库** | `list_public_templates`, `fork_public_template` | 浏览并复刻管理员发布的公共模板 |
| **日志 & 可观测** | `list_logs`, `get_log_detail`, `get_usage_summary` | 调用日志（全文搜索、状态/模型/时间过滤）、用量统计（多维聚合） |
| **API Key 管理** | `list_api_keys`, `create_api_key`, `revoke_api_key` | 查看/创建/吊销访问密钥 |

---

## 第二步：系统能力逆向推演

### 平台性质

这是一个 **AI 服务商聚合网关（AI Model Aggregator / LLM Router）**，商业逻辑为：

> 向上整合多家 AI 服务商（OpenAI、Anthropic、Google、DeepSeek、智谱、字节、百度、Moonshot、Minimax、Qwen 等），向下提供统一 API 接口，并叠加 **提示词编排层（Action/Template）**、**用量计费**、**审计日志** 三大增值服务。本质是 API 转售 + Prompt 工程平台的结合体。

### 新开发者核心 Workflow

```
1. get_balance          确认账户可用余额
         ↓
2. list_models          浏览模型目录，对比价格与 capabilities
         ↓
3. chat / generate_image  直接调用，快速原型验证
         ↓
4. create_action        将验证好的 prompt 封装为可复用的原子单元
         ↓
5. create_template      将多个 Action 串联成业务工作流
         ↓
6. run_template         以工作流为单位执行生产调用
         ↓
7. list_logs + get_usage_summary  监控成本、排查错误
```

---

## 第三步：极客视角吐槽与优化建议

### 问题 1：错误信息被过度脱敏，调试体验近乎灾难

在 `get_log_detail` 返回的 `error` 字段中，出现了以下占位符：

```
"The model or [infra removed] does not exist or you do not have access to it. [rid removed]"
"Image generation did not return a valid image. [upstream preview removed]"
```

三处关键信息被删除：基础设施标识、请求 ID（rid）、上游错误预览。开发者看到这条错误后完全不知道：是模型名拼错？还是 API Key 权限不足？还是上游服务宕机？

**建议：** 保留 `request_id`（映射到内部追踪系统即可，无需暴露真实基础设施名）；错误分类用枚举码（如 `ERROR_CODE: MODEL_NOT_FOUND`），让开发者可以程序化处理。

---

### 问题 2：`list_models` 与实际可用性严重脱节

`deepseek-v3` 在 `list_models` 中正常显示，价格、contextWindow、capabilities 一应俱全——但**过去 30 天 22 次调用全部失败（100% 错误率）**，错误原因是"模型不存在或无访问权限"。更严重的是，公开模板库"严审版"的 5 个步骤**全部绑定了 deepseek-v3**，意味着这条官方推荐工作流是完全不可用的。

同时，`qwen-image` 和 `claude-sonnet-4.6` 出现在 30 天用量统计中，但完全不在当前 `list_models` 结果里——幽灵模型问题双向存在。

**建议：** `list_models` 增加 `available: boolean` 字段，实时反映模型接入状态；在模型临时下线时应触发 Template 级别的健康告警，而非让用户在运行时才踩坑。

---

### 问题 3：`generate_image` 的 `size` 参数缺乏 Schema 级枚举约束

`generate_image` 的 `size` 参数类型为纯 `string`，没有 `enum` 限制。文档说"必须从 supportedSizes 中选择"，但这是靠人肉阅读来保证的，Schema 层面无法拦截。

此外，`gpt-image-mini` 的 `supportedSizes` 中包含 `"auto"` 这个非尺寸字符串，与其他三个模型的 `"WxH"` 格式格格不入，但没有任何文档说明 `"auto"` 代表什么行为。

**建议：** `generate_image` Schema 中 `size` 改为动态枚举（或在描述中明确列出，配合 `list_models` 调用链），`"auto"` 的语义必须显式说明。

---

### 问题 4：Action 版本管理存在"默认激活"行为不一致

`create_action_version` 文档说"默认设为活跃版本"，但当前项目中 `DX审计-文章生成器` 存在 v1/v2/v3 三个版本，**激活的却是 v1**（最旧版本）。这意味着要么文档与实现不符，要么版本被静默回滚过——而 `list_actions` 和 `get_action_detail` 均无任何"最后激活变更时间"或"激活操作者"记录。

**建议：** 版本激活操作应记录操作时间（`activatedAt`）；`list_actions` 摘要中应展示当前激活版本号，而非只显示 `versionNumber: 1`（目前这个字段是歧义的——是"最新版本号是1"还是"激活版本号是1"？）。

---

### 问题 5：能力声明（capabilities）与实际行为数据不一致

`glm-4.7-flash` 在 `list_models` 中 `capabilities.reasoning = false`，但日志中该模型的调用返回了非零的 `reasoningTokens`（285、1395），且计入了费用。这说明：要么 capabilities 声明错误，要么 reasoningTokens 字段的语义被误用（可能是内部思维链 token 的泄漏）。

**建议：** `reasoningTokens` 仅在 `capabilities.reasoning = true` 的模型上返回非 null 值；若该字段对所有模型均有意义（如内部隐式 CoT），需在文档中显式说明其含义边界。

---

### 问题 6：`get_log_detail` 响应体存在 HTML 实体转义

成功调用的响应内容中出现了 `&#x27;`（HTML 实体，代表单引号）：

```
"response": "Hello! I&#x27;m doing well, thank you for asking."
```

API 响应不是 HTML 上下文，HTML 转义是多余的处理，会导致客户端需要额外反转义才能使用原始文本，是典型的 XSS 防护代码被错误地应用到了 API 层。

---

### 问题 7：公开模板步骤命名与执行顺序错位

公开模板"严审版"中，步骤的 `actionName` 与实际执行 order 存在命名混乱：

| 执行顺序 | actionName |
|---------|------------|
| 2 (第3步) | 需求审查-**步骤4**-安全与合规审查 |
| 3 (第4步) | 需求审查-**步骤3.5**-测试设计深化 |
| 4 (第5步) | 需求审查-**步骤3**-验收与测试计划 |

步骤 3→3.5→4 的命名对应实际执行顺序是倒序的，这表明在创建模板时步骤被手动排序修改，但 Action 名称未同步更新。对 fork 这个模板的用户会造成严重的认知混乱。

另外，用户项目模板中步骤 `order` 从 **1** 开始，而公开模板中步骤 `order` 从 **0** 开始——同一字段，两套起始值标准。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "幽灵模型：qwen-image 和 claude-sonnet-4.6 出现在用量统计中，但不在 list_models 返回结果里",
      "assertion": "get_usage_summary(period='30d', group_by='model') 返回的每个 key 值，在 list_models() 返回的模型列表中必须存在对应 id",
      "actual": "get_usage_summary 返回了 qwen-image（6次成功）和 claude-sonnet-4.6（2次成功），但 list_models() 不返回这两个模型",
      "expected": "用量统计中出现的所有模型 key 必须在 list_models 中可查到，否则应有下线状态标记"
    },
    {
      "id": "DX-002",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "deepseek-v3 在模型目录中显示为可用，但过去 30 天 22 次调用全部失败（100% 错误率）",
      "assertion": "list_models() 返回的模型，在 get_usage_summary(group_by='model') 中 successCalls > 0，或至少拥有 available=true 的可用性标记",
      "actual": "deepseek-v3 在 list_models 正常展示，但 get_usage_summary 显示 totalCalls=22, successCalls=0, errorCalls=22",
      "expected": "list_models 应实时反映模型可用状态，不可用模型应标记 available=false 或从列表中移除"
    },
    {
      "id": "DX-003",
      "severity": "critical",
      "category": "安全",
      "tool": "chat",
      "description": "含 shellcode 和 PE 文件头的恶意 prompt 被系统原样转发给上游模型，未触发任何内容安全过滤",
      "assertion": "chat(model, messages=[{role:'user', content:'MZ\\x90...SHELLCODE...'}]) 应返回 status='filtered' 而非被转发执行",
      "actual": "日志 trc_ucylh5a60z3t6p1lqikiswrs 显示含 shellcode 的 prompt 被完整转发给 gpt-image-mini，等待了 21 秒才因上游拒绝而失败",
      "expected": "应在网关层对 prompt 进行内容安全检测，拦截包含可执行代码特征或注入意图的输入，返回 status='filtered'"
    },
    {
      "id": "DX-004",
      "severity": "high",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "错误信息被过度脱敏，[infra removed]、[rid removed]、[upstream preview removed] 等占位符使调试信息完全丧失",
      "assertion": "get_log_detail(trace_id) 返回的 error 字段不应包含字符串 '[infra removed]' 或 '[rid removed]' 或 '[upstream preview removed]'",
      "actual": "error: 'The model or [infra removed] does not exist or you do not have access to it. [rid removed]'",
      "expected": "error 字段应包含结构化错误码（如 MODEL_NOT_FOUND）和对开发者有意义的 request_id，而非脱敏后的空洞占位符"
    },
    {
      "id": "DX-005",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "glm-4.7-flash 声明 capabilities.reasoning=false，但实际调用日志返回非零 reasoningTokens（最高 1395）",
      "assertion": "capabilities.reasoning=false 的模型，其 get_log_detail 返回的 usage.reasoningTokens 应为 null 或 0",
      "actual": "glm-4.7-flash（reasoning=false）在两条成功日志中分别返回 reasoningTokens=285 和 reasoningTokens=1395",
      "expected": "capabilities.reasoning=false 的模型不应在日志中出现非零 reasoningTokens，如有内部隐式推理需在 capabilities 中显式声明"
    },
    {
      "id": "DX-006",
      "severity": "high",
      "category": "DX",
      "tool": "list_public_templates",
      "description": "官方公开模板「严审版」全部 5 个步骤绑定了 deepseek-v3，而该模型当前 100% 不可用，导致官方推荐工作流完全无法运行",
      "assertion": "list_public_templates() 返回的每个模板，其所有步骤绑定的模型在 list_models() 中均应可用（successRate > 0）",
      "actual": "公开模板 cmnrce652000pbn5o4w46vy09 的 5 步全部使用 deepseek-v3，而 deepseek-v3 过去 30 天成功率为 0%",
      "expected": "公开模板中使用的模型应为当前可用状态，或在模板详情中标注模型不可用警告"
    },
    {
      "id": "DX-007",
      "severity": "high",
      "category": "数据一致性",
      "tool": "get_template_detail",
      "description": "公开模板与用户模板的步骤 order 字段起始值不一致：公开模板从 0 开始，用户模板从 1 开始",
      "assertion": "同一平台内，list_templates 和 list_public_templates 返回的 Template steps 中 order 字段的起始值应统一",
      "actual": "公开模板 cmnrce652000pbn5o4w46vy09 的 steps[0].order=0；用户模板 cmo0gvic0000fbn6ab1ltkr59 的 steps[0].order=1",
      "expected": "order 字段应统一从相同基数（0 或 1）开始，不应存在跨模板的不一致"
    },
    {
      "id": "DX-008",
      "severity": "medium",
      "category": "DX",
      "tool": "generate_image",
      "description": "size 参数类型为 string 且无 enum 约束，非法尺寸值只能在运行时报错，无法在调用前被 Schema 拦截",
      "assertion": "generate_image Schema 中 size 参数应包含 enum 限制（或 pattern 正则），或在调用时对传入 size 与目标模型的 supportedSizes 做交叉校验并提前返回错误",
      "actual": "size 参数 Schema 为 {type: 'string'}，无任何格式或枚举约束",
      "expected": "size 参数应有枚举约束或运行时快速校验，不合法尺寸应在转发前即返回 400 错误"
    },
    {
      "id": "DX-009",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "图片模型 gpt-image-mini 在用量统计中出现非零 totalTokens（394），但图片生成模型不应产生 token 计量",
      "assertion": "get_usage_summary(group_by='model') 中，modality='image' 的模型对应条目的 totalTokens 应为 0 或 null",
      "actual": "gpt-image-mini（image 模型）的 totalTokens=394",
      "expected": "图片模型的用量统计应只体现 totalCalls 和 totalCost，totalTokens 应为 0 或不展示"
    },
    {
      "id": "DX-010",
      "severity": "medium",
      "category": "容错",
      "tool": "generate_image",
      "description": "图片生成请求在上游模型无法完成时等待了 58 秒才返回失败，缺乏合理的超时快速失败机制",
      "assertion": "generate_image 调用的 error 响应中 latency 应小于合理阈值（如 30 秒），超时应被网关主动截断并返回 TIMEOUT 错误",
      "actual": "日志 trc_xcpoayfb6tt5cuahuwlo97ac 显示 gpt-image-mini 调用等待了 58.3 秒才返回错误",
      "expected": "网关应设置图片生成的最大等待时长（如 30s），超时后主动返回超时错误而非无限等待上游"
    },
    {
      "id": "DX-011",
      "severity": "medium",
      "category": "DX",
      "tool": "get_log_detail",
      "description": "response 字段中存在 HTML 实体转义字符（&#x27;），API 响应不应进行 HTML 转义处理",
      "assertion": "get_log_detail(trace_id).response 字段不应包含 HTML 实体字符串（如 &#x27; &amp; &lt; &gt; 等）",
      "actual": "response: 'Hello! I&#x27;m doing well, thank you for asking.'（&#x27; 为单引号的 HTML 实体编码）",
      "expected": "API 响应中的模型输出应返回原始文本，不应进行 HTML 转义"
    },
    {
      "id": "DX-012",
      "severity": "medium",
      "category": "DX",
      "tool": "list_logs",
      "description": "list_logs 不支持按 action_id 或 template_id 过滤，无法追踪某个具体 Action/Template 的历史调用",
      "assertion": "list_logs(action_id='xxx') 应只返回由该 Action 触发的日志条目",
      "actual": "list_logs Schema 中无 action_id 或 template_id 过滤参数",
      "expected": "list_logs 应与 get_usage_summary 的过滤维度对齐，支持 action_id 和 template_id 过滤"
    },
    {
      "id": "DX-013",
      "severity": "medium",
      "category": "DX",
      "tool": "activate_version",
      "description": "action 版本管理中，list_actions 摘要仅显示激活版本号，但无法区分「该 Action 只有 1 个版本」与「有多个版本但激活的是 v1」",
      "assertion": "list_actions() 返回的每个 Action 中，activeVersion 字段应同时包含 versionNumber（激活版本号）和 totalVersions（总版本数）",
      "actual": "list_actions 返回 activeVersion: {versionNumber: 1, variableCount: 6}，无总版本数字段；get_action_detail 才能看到 versions 数组（共 3 个版本）",
      "expected": "list_actions 摘要中应展示 totalVersions 字段，让开发者无需进入详情即可感知是否存在多个版本"
    },
    {
      "id": "DX-014",
      "severity": "low",
      "category": "DX",
      "tool": "chat",
      "description": "错误响应语言不统一：速率限制错误为中文，模型不可用错误为英文（含脱敏），影响国际化和程序化错误处理",
      "assertion": "相同 status='error' 条件下，get_log_detail 返回的 error 字段应使用统一的语言（全中文或全英文）和结构化格式",
      "actual": "速率限制返回「您的账户已达到速率限制，请您控制请求频率」（中文）；模型不可用返回「The model or [infra removed] does not exist...」（英文）",
      "expected": "所有错误消息应统一语言，并附带 error_code 枚举值供程序化判断"
    },
    {
      "id": "DX-015",
      "severity": "low",
      "category": "DX",
      "tool": "create_api_key",
      "description": "create_api_key 无过期时间（expiresAt）参数，无法创建临时或短期密钥，不符合最小权限原则",
      "assertion": "create_api_key Schema 应包含可选的 expiresAt 参数（ISO 8601 日期字符串）",
      "actual": "create_api_key Schema 仅有 name（必填）和 description（可选）两个参数，无任何有效期控制",
      "expected": "应支持创建有时效限制的 API Key，满足临时授权、CI/CD 集成等场景的最小权限需求"
    }
  ]
}
```
