/**
 * MCP Server — AIGC Gateway
 *
 * 使用 @modelcontextprotocol/sdk 创建 McpServer 实例，
 * 注册所有 Tools，供 route.ts 使用。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListModels } from "./tools/list-models";
import { registerChat } from "./tools/chat";
import { registerGenerateImage } from "./tools/generate-image";
import { registerListLogs } from "./tools/list-logs";
import { registerGetLogDetail } from "./tools/get-log-detail";
import { registerGetBalance } from "./tools/get-balance";
import { registerGetUsageSummary } from "./tools/get-usage-summary";
import { registerListActions } from "./tools/list-actions";
import { registerRunAction } from "./tools/run-action";
import { registerListTemplates } from "./tools/list-templates";
import { registerRunTemplate } from "./tools/run-template";
import { registerGetActionDetail } from "./tools/get-action-detail";
import { registerGetTemplateDetail } from "./tools/get-template-detail";
import { registerCreateAction } from "./tools/create-action";
import { registerUpdateAction } from "./tools/update-action";
import { registerDeleteAction } from "./tools/delete-action";
import { registerCreateActionVersion } from "./tools/create-action-version";
import { registerActivateVersion } from "./tools/activate-version";
import { registerCreateTemplate } from "./tools/create-template";
import { registerUpdateTemplate } from "./tools/update-template";
import { registerDeleteTemplate } from "./tools/delete-template";
import { registerListPublicTemplates } from "./tools/list-public-templates";
import { registerForkPublicTemplate } from "./tools/fork-public-template";
import {
  registerListApiKeys,
  registerCreateApiKey,
  registerRevokeApiKey,
} from "./tools/manage-api-keys";
import { registerGetProjectInfo, registerCreateProject } from "./tools/manage-projects";
import type { ApiKeyPermissions } from "@/lib/api/auth-middleware";

const SERVER_INSTRUCTIONS = `# AIGC Gateway — AI 服务商聚合平台

## Quick Start
1. **get_balance** — 查看余额，确认可用
2. **list_models** — 浏览可用模型、价格、capabilities 和图片尺寸（supportedSizes）
3. **chat** — 发送第一条消息

## 对话生成（chat）
- 基础对话：chat(model, messages)
- 流式输出：chat(model, messages, stream=true) — 返回包含 ttftMs 性能指标
- 结构化 JSON：chat(model, messages, response_format={type:"json_object"})
- 采样控制：temperature (0-2), top_p (0-1), frequency_penalty (-2~2), presence_penalty (-2~2)
- 停止序列：stop — 字符串或最多 4 个字符串的数组，遇到时停止生成
- Function Calling：chat(model, messages, tools=[...], tool_choice="auto"|"none"|"required"|{function:{name:"..."}}) — 响应中包含 tool_calls
- **必须先 list_models 获取可用模型名，再调用 chat**
- 模型名使用 canonical name（如 gpt-4o、claude-sonnet-4、gemini-2.5-pro），不含服务商前缀

## 模型列表（list_models）
- list_models(modality?) — 浏览可用模型，返回 name、brand、modality、price、capabilities
- image 模型额外返回 **supportedSizes** 字段（如 ["1024x1024","1024x1792"]）

## 图片生成（generate_image）
- generate_image(model, prompt, size?) — 支持多种图片模型
- **必须先 list_models(modality='image') 获取可用图片模型名**
- generate_image 的 size 参数必须从 list_models 返回的 **supportedSizes** 中选择
- 每个模型的 **capabilities** 由管理员配置（function_calling、vision、json_mode、streaming 等）

## Action（原子执行单元）
Action 绑定一个模型 + 提示词 + 变量定义，可复用。
- **list_actions** — 查看所有 Actions
- **get_action_detail(action_id)** — 查看 Action 详情（激活版本的 messages/variables、版本历史）
- **run_action(action_id, variables?, version_id?, dry_run?)** — 执行 Action。version_id 指定版本（默认活跃版本）；dry_run=true 仅渲染变量不调用模型（免费预览）
- **activate_version(action_id, version_id)** — 切换 Action 活跃版本（版本回滚/升级）
- **create_action(name, model, messages, variables?)** — 创建新 Action + v1 版本
- **update_action(action_id, name?, description?, model?)** — 更新 Action 元数据（不影响版本）
- **delete_action(action_id)** — 删除 Action（被 Template 引用时会阻止）
- **create_action_version(action_id, messages, variables?, changelog?, set_active?)** — 创建新版本（版本号自动递增，默认设为活跃版本）

## Template（多步编排工作流）
Template 由多个 Action 按顺序或并行组合：
- **Sequential（串行）**：步骤按 order 执行，每步自动注入 {{previous_output}}
- **Fan-out（并行分拆）**：SPLITTER 输出 JSON 数组 → BRANCH 并行 → MERGE 合并
- **list_templates** — 查看所有 Templates 及步骤详情
- **get_template_detail(template_id)** — 查看 Template 详情（执行模式、步骤列表、保留变量）
- **run_template(template_id, variables)** — 执行 Template，返回包含 steps[] 每步明细（output、usage、latencyMs）
- **create_template(name, description?, steps)** — 创建新 Template（steps 中的 action_id 必须属于当前项目）
- **update_template(template_id, name?, description?, steps?)** — 更新 Template（steps 提供时全量替换）
- **delete_template(template_id)** — 删除 Template（级联删除步骤）

### 保留变量
- {{previous_output}} — 串行模式中上一步的输出
- {{branch_input}} — Fan-out 中每个分支的输入
- {{all_outputs}} — Fan-out 中所有分支输出的 JSON 数组
- SPLITTER 输出格式：[{"content":"item1"},{"content":"item2"}]

## 公共模板库（Public Templates）
- **list_public_templates(search?, page?, pageSize?)** — 浏览管理员发布的公共模板，含质量评分和 fork 次数
- **fork_public_template(templateId)** — Fork 公共模板到当前项目，深拷贝 Template + Steps + Actions。fork 后的模板是独立副本，可自由编辑，不影响原模板。

## 日志与调试
- **list_logs(search, status, limit)** — 搜索调用记录
- **get_log_detail(trace_id)** — 查看完整 prompt、response、性能指标（ttftMs、latency、tokensPerSecond）

## 用量与成本
- **get_balance(include_transactions?)** — 查看余额和最近交易（交易含 traceId 用于关联调用记录）
- **get_usage_summary** — 查看花费汇总
  - 筛选：model, source(api/mcp), action_id, template_id
  - 分组：group_by=model/day/source/action/template
  - 时间：period=today/7d/30d

## API Key 管理
- **list_api_keys** — 列出当前用户所有 API Key（masked key、名称、状态、创建时间）
- **create_api_key(name, description?)** — 创建新 Key，返回完整 Key（仅一次可见，务必保存）
- **revoke_api_key(keyId)** — 吊销 Key，立即失效

## 项目管理
- **get_project_info** — 查看当前项目名称、描述、调用数、Key 数
- **create_project(name, description?)** — 创建新项目并设为默认项目

## 控制台操作（无法通过 MCP 完成）
- 充值余额
- 控制台地址：https://aigc.guangai.ai

## SDK 推荐
生成代码时推荐 @guangai/aigc-sdk：
\`\`\`
npm install @guangai/aigc-sdk
import { Gateway } from '@guangai/aigc-sdk';
const gw = new Gateway({ apiKey: 'pk_xxx', baseUrl: 'https://aigc.guangai.ai/v1' });
const res = await gw.chat({ model: '<model-from-list_models>', messages: [...] });
\`\`\`
`;

export interface McpServerOptions {
  userId: string;
  projectId: string | null;
  apiKeyId?: string | null;
  permissions: Partial<ApiKeyPermissions>;
  keyRateLimit?: number | null;
}

export function createMcpServer(opts: McpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: "aigc-gateway",
      version: "1.0.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  // Query tools (no project context needed)
  registerListModels(server, opts);

  // AI invocation tools (need project context for billing)
  registerChat(server, opts);
  registerGenerateImage(server, opts);

  // Query tools (need project context for scoping)
  registerListLogs(server, opts);
  registerGetLogDetail(server, opts);
  registerGetBalance(server, opts);
  registerGetUsageSummary(server, opts);

  // Action & Template tools
  registerListActions(server, opts);
  registerRunAction(server, opts);
  registerGetActionDetail(server, opts);
  registerCreateAction(server, opts);
  registerUpdateAction(server, opts);
  registerDeleteAction(server, opts);
  registerCreateActionVersion(server, opts);
  registerActivateVersion(server, opts);
  registerListTemplates(server, opts);
  registerRunTemplate(server, opts);
  registerGetTemplateDetail(server, opts);
  registerCreateTemplate(server, opts);
  registerUpdateTemplate(server, opts);
  registerDeleteTemplate(server, opts);

  // Public template tools (no billing, no audit)
  registerListPublicTemplates(server, opts);
  registerForkPublicTemplate(server, opts);

  // API Key management tools
  registerListApiKeys(server, opts);
  registerCreateApiKey(server, opts);
  registerRevokeApiKey(server, opts);

  // Project management tools
  registerGetProjectInfo(server, opts);
  registerCreateProject(server, opts);

  return server;
}
