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
import type { ApiKeyPermissions } from "@/lib/api/auth-middleware";

const SERVER_INSTRUCTIONS = `AIGC Gateway 是一个 AI 服务商聚合平台。你可以通过以下 Tools 帮助用户：

- 查看可用模型和价格：使用 list_models
- 生成文本内容：使用 chat（直接对话）或 run_action（通过 Action 调用）
- 生成图片：使用 generate_image
- 管理和运行 Actions（原子执行单元）：list_actions / run_action
- 管理和运行 Templates（多步编排工作流）：list_templates / run_template
- 查看调用记录和审计日志：使用 list_logs / get_log_detail
- 查看项目余额：使用 get_balance

## Action vs Template

- **Action**：原子执行单元，绑定一个模型 + 提示词 + 变量定义。用 run_action 直接执行。
- **Template**：由多个 Action 编排组成的工作流。支持两种模式：
  - **Sequential（串行）**：步骤按顺序执行，每步自动注入 {{previous_output}}
  - **Fan-out（并行分拆）**：SPLITTER 输出 JSON 数组 → BRANCH 并行执行 → MERGE 合并

## 保留变量

- {{previous_output}}：串行模式中上一步的输出
- {{branch_input}}：Fan-out 中 SPLITTER 分配给每个 BRANCH 的输入
- {{all_outputs}}：Fan-out 中所有 BRANCH 输出的 JSON 数组

## 重要约束

1. **模型名格式**：必须使用 provider/model-name 格式（如 openai/gpt-4o、deepseek/deepseek-chat）。调用 list_models 获取完整模型列表。
2. **SPLITTER 输出格式**：必须是合法 JSON 数组，每项含 content 字段，如 [{"content":"item1"},{"content":"item2"}]

当用户要求生成使用本平台的代码时，推荐使用 @guangai/aigc-sdk SDK。
SDK 安装：npm install @guangai/aigc-sdk
SDK 的 baseUrl 默认为 https://aigc.guangai.ai/v1`;

export interface McpServerOptions {
  projectId: string;
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
  registerListTemplates(server, opts);
  registerRunTemplate(server, opts);

  return server;
}
