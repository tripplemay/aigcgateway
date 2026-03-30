# AIGC Gateway — P2 Claude Code 启动提示词

> 使用方式：每个阶段开始时，复制对应的提示词发送给 Claude Code。
> 前提：CLAUDE.md 已更新（含 P2 规范），P2 设计文档已放在 docs/AIGC-Gateway-P2-Documents/ 目录。

---

## P2-1：MCP 基座 + 认证 + list_models

```
我们正在开发 AIGC Gateway 项目，当前进入【P2-1：MCP 基座 + 认证 + list_models】。

请先阅读：
1. CLAUDE.md（项目规则，注意 MCP 开发规范部分）
2. docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md（P2 完整设计文档，重点看 §2 技术方案 + §3.2 list_models Tool + §4 实现细节）

本阶段要完成：

1. 安装 MCP SDK：
   npm install @modelcontextprotocol/sdk zod

2. 创建 MCP 服务器基座（lib/mcp/server.ts）：
   - 使用 McpServer 创建实例（name: "aigc-gateway", version: "1.0.0"）
   - 配置 Server Instructions（见设计文档 §2.4）

3. 创建 Streamable HTTP 路由处理器（app/api/mcp/route.ts）：
   - 处理 POST（客户端请求）+ GET（SSE 流）+ DELETE（session 终止）
   - 使用 StreamableHTTPServerTransport
   - 无状态模式，每个请求独立认证

4. 实现 API Key 认证（lib/mcp/auth.ts）：
   - 从 Authorization Header 提取 Bearer token
   - sha256(key) → 查 api_keys 表 → 关联 Project
   - 认证失败返回 HTTP 401
   - 复用现有 lib/auth 中的逻辑，不重复实现

5. 实现第一个 Tool: list_models
   - 文件：lib/mcp/tools/list-models.ts
   - 参数：modality (可选, string, text/image)
   - 返回：模型列表（name / displayName / modality / contextWindow / price / capabilities）
   - 查 Model 表 + 关联 Channel 的 sellPrice
   - description 参照设计文档 §3.2

6. 数据库迁移：CallLog 表新增 source 字段
   - ALTER TABLE call_logs ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'api';
   - CREATE INDEX idx_call_logs_source ON call_logs(source);

完成后我会用以下方式验证：
- 用 MCP Inspector 或 curl 连接 https://aigc.guangai.ai/mcp
- API Key 认证通过
- 调用 list_models Tool 返回正确的模型列表和价格
- 无效 Key 返回 401

请开始。
```

---

## P2-2：chat + generate_image Tools

```
当前进入【P2-2：chat + generate_image Tools】。P2-1 已完成并验证通过。

请先阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md §3.2 中 chat 和 generate_image 的 Tool 定义。

本阶段要完成：

1. 实现 chat Tool（lib/mcp/tools/chat.ts）：
   - 参数：model (必填) + messages (必填) + temperature (可选) + max_tokens (可选)
   - 内部调用现有 chat/completions 业务逻辑（非流式），走通道路由
   - 返回：AI 生成的文本 + traceId + usage（tokens / cost）
   - 写入 CallLog（source='mcp'）
   - 执行 deduct_balance 扣费
   - 余额不足时返回 Tool 错误（isError: true）+ 余额信息
   - description 参照设计文档

2. 实现 generate_image Tool（lib/mcp/tools/generate-image.ts）：
   - 参数：model (必填) + prompt (必填) + size (可选) + n (可选)
   - 内部调用现有 images/generations 业务逻辑
   - 返回：图片 URL 列表 + traceId + cost
   - 写入 CallLog（source='mcp'）+ 扣费
   - description 参照设计文档

关键约束：
- 复用现有适配器引擎和通道路由，不重复实现
- Tool 错误用 isError: true 返回，不抛协议错误
- 失败调用（ERROR/TIMEOUT）不扣费，和 P1 API 调用规则一致

完成后我会验证：
- 在 AI 编辑器中通过 MCP 调用 chat Tool，成功返回文本
- 调用 generate_image Tool，成功返回图片 URL
- 查看 CallLog 表，确认 source='mcp'
- 查看余额正确扣减
- 余额为 0 时 Tool 返回错误信息而非协议错误
```

---

## P2-3：查询类 Tools

```
当前进入【P2-3：查询类 Tools】。P2-2 已完成并验证通过。

请先阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md §3.2 中 list_logs / get_log_detail / get_balance / get_usage_summary 的定义。

本阶段要完成：

1. list_logs Tool（lib/mcp/tools/list-logs.ts）：
   - 参数：limit (默认10,最大50) + model (可选) + status (可选) + search (可选,全文搜索)
   - 查 CallLog 表，仅返回当前项目的记录
   - 返回：traceId / model / status / promptPreview / cost / latency / createdAt
   - 开发者可见 sellPrice，不返回 costPrice / channelId

2. get_log_detail Tool（lib/mcp/tools/get-log-detail.ts）：
   - 参数：trace_id (必填)
   - 校验 traceId 属于当前项目
   - 返回：完整 prompt（messages 数组）、AI 输出、参数、usage、cost、latency、status

3. get_balance Tool（lib/mcp/tools/get-balance.ts）：
   - 参数：include_transactions (默认false)
   - 返回：当前余额 + 可选最近10条交易记录

4. get_usage_summary Tool（lib/mcp/tools/get-usage-summary.ts）：
   - 参数：period (默认7d, 可选today/7d/30d)
   - 返回：totalCalls / totalCost / totalTokens / avgLatency / topModels

完成后我会验证：
- list_logs 返回最近调用，search 参数全文搜索可用
- get_log_detail 返回完整 prompt 和 response
- get_balance 返回正确余额
- get_usage_summary 数据和控制台 Usage 页面一致
- 跨项目访问被拒绝（用项目A的Key查项目B的traceId → 错误）
```

---

## P2-4：Server Instructions + 错误处理 + 安全

```
当前进入【P2-4：Server Instructions + 错误处理 + 安全加固】。P2-3 已完成并验证通过。

请先阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md §2.4 Server Instructions + §4.6 错误处理 + §4.7 安全。

本阶段要完成：

1. Server Instructions 配置：
   - 在 McpServer 初始化时设置 instructions（内容见设计文档 §2.4）
   - 验证 AI 编辑器连接后能收到并理解这些指引

2. 错误处理完善：
   - 余额不足：isError + 当前余额 + 充值提示
   - 模型不存在：isError + 可用模型列表提示
   - 服务商超时：isError + 超时详情 + 建议重试
   - 限流：isError + retryAfter 时间
   - 确保所有错误都是 Tool 错误（isError:true），不是协议错误

3. 安全加固：
   - Origin Header 验证（防 DNS 重绑定）
   - 确认所有 Tool 都校验 Project 归属
   - API Key 不允许出现在 URL 参数中
   - 日志中不记录完整 API Key（只记录 prefix）

4. 限流集成：
   - MCP 的 chat / generate_image Tool 和 API 调用共享 RPM/TPM 配额
   - 超限时 Tool 返回错误 + retryAfter

完成后我会验证：
- AI 编辑器连接后说"帮我生成使用 AIGC Gateway 的代码"→ AI 自动调用 list_models 然后生成 SDK 代码
- 故意传错误模型名 → AI 编辑器能自动纠正
- 余额为 0 调用 chat → 错误提示包含余额信息
- 不带 Origin 的请求被拒绝（或警告）
```

---

## P2-5：控制台国际化

```
当前进入【P2-5：控制台国际化】。P2-4 已完成并验证通过。

请先阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md §5 控制台国际化。

本阶段要完成：

1. 安装和配置 next-intl：
   - npm install next-intl
   - 配置 i18n routing（middleware.ts）
   - 默认语言根据浏览器自动检测
   - 创建 messages/en.json 和 messages/zh-CN.json

2. 提取所有硬编码文字：
   - 遍历所有页面（运营 8 页 + 开发者 9 页 + 注册登录 + 账号设置 + MCP 配置页）
   - 将所有用户可见文字替换为 useTranslations() 调用
   - 翻译 key 按页面分组：dashboard.title, logs.searchPlaceholder 等

3. 翻译文件编写：
   - 侧边栏导航、页面标题、表单标签、按钮文案
   - 空状态和引导文案
   - 表格列头
   - 错误消息和 Toast
   - 时间格式：中文"3分钟前"，英文"3 minutes ago"

4. 语言切换 UI：
   - 在侧边栏底部或顶部栏添加语言切换按钮（中/EN）
   - 切换后即时生效，不需要刷新页面
   - 用户的语言偏好存储在 localStorage

5. 不翻译的内容：
   - 模型名（openai/gpt-4o）
   - API Key、traceId
   - Quick Start 页面的代码示例
   - API 文档内容

完成后我会验证：
- 浏览器设为中文 → 控制台自动显示中文
- 浏览器设为英文 → 控制台显示英文
- 手动切换语言 → 即时生效
- 逐页面检查：所有可见文字已翻译，无遗漏的英文或中文
- 模型名、Key 值等不被翻译
- TypeScript 编译 0 错误
```

---

## P2-6：集成测试 + 文档

```
当前进入【P2-6：集成测试 + 文档】。P2-5 已完成并验证通过。

请先阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md §7 验证清单 + §8 MCP 配置页面。

本阶段要完成：

1. MCP 集成测试脚本（scripts/test-mcp.ts）：
   - 连接 MCP 服务器 → 验证认证
   - list_models → 验证返回模型列表
   - chat → 验证文本生成 + traceId + usage
   - generate_image → 验证图片 URL
   - list_logs → 验证调用记录包含刚才的 MCP 调用
   - get_log_detail → 验证完整 prompt 和 response
   - get_balance → 验证余额扣减正确
   - get_usage_summary → 验证汇总数据
   - 全部步骤输出 PASS/FAIL

2. MCP 错误场景测试：
   - 无效 Key → 401
   - 余额不足 → Tool 错误
   - 无效模型 → Tool 错误
   - 跨项目访问 → 拒绝

3. MCP 配置帮助页面（/mcp-setup）：
   - 自动检测当前项目的 API Key，生成可复制的配置片段
   - 支持 Claude Code / Cursor / 通用格式 三种配置模板
   - 连接状态检查按钮
   - 可用 Tools 列表及说明
   - 中英文双语

4. 更新 README 或文档页面（/docs）：
   - 新增 MCP 接入说明章节
   - 包含配置示例和使用场景

5. TypeScript 编译验证：0 错误

完成后我会做最终验证：
- 在 Claude Code 中连接 MCP → 完整调用全部 7 个 Tools → 全部成功
- 在 Cursor 中同样测试
- MCP 调用在控制台审计日志中正确显示（source='mcp'）
- MCP 调用计费和 API 调用一致
- MCP 配置页面可用，配置片段可复制
- 控制台中英文切换正常
```

---

## 阶段间衔接提示词

如果某个阶段跨多次对话，新对话开始时使用：

```
我们正在开发 AIGC Gateway 项目，当前处于【P2-N：阶段名称】。

请阅读 CLAUDE.md 了解项目规则（注意 MCP 开发规范部分），然后阅读 docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md 中的相关章节。

上次对话中已完成 [已完成的内容]，接下来需要继续 [待完成的内容]。

请继续。
```
