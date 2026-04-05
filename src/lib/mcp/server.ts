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
import { registerCreateTemplate } from "./tools/create-template";
import { registerConfirmTemplate } from "./tools/confirm-template";
import { registerListTemplates } from "./tools/list-templates";
import { registerGetTemplate } from "./tools/get-template";
import { registerUpdateTemplate } from "./tools/update-template";
import type { ApiKeyPermissions } from "@/lib/api/auth-middleware";

const SERVER_INSTRUCTIONS = `AIGC Gateway 是一个 AI 服务商聚合平台。你可以通过以下 Tools 帮助用户：

- 查看可用模型和价格：使用 list_models
- 生成文本内容：使用 chat（支持流式和模板调用）
- 生成图片：使用 generate_image
- 管理 Prompt 模板：使用 create_template → confirm_template 创建，list_templates / get_template 查看，update_template 更新
- 使用模板调用：chat 工具支持 templateId + variables 参数
- 查看调用记录和审计日志：使用 list_logs / get_log_detail
- 查看项目余额：使用 get_balance
- 生成对接代码时：先调用 list_models 了解可用模型，然后生成使用 @guangai/aigc-sdk 的代码

## 重要约束

1. **模型名格式**：必须使用 provider/model-name 格式（如 openai/gpt-4o、deepseek/deepseek-chat）。调用 list_models 获取完整模型列表。
2. **template_id 支持范围**：template_id + variables 在 MCP chat Tool、REST API /v1/chat/completions、SDK chat() 中均可用。
3. **update_template 版本激活**：update_template 创建新版本后，该版本不会自动生效。需要用户在控制台手动将新版本设为 active version，之后 chat 调用才会使用新版本。
4. **后端集成推荐方式**：使用 @guangai/aigc-sdk，通过 chat() 方法传入 template_id + variables：
   \`\`\`typescript
   import { Gateway } from '@guangai/aigc-sdk';
   const gw = new Gateway({ apiKey: 'pk_xxx', baseUrl: 'https://aigc.guangai.ai/v1' });
   const res = await gw.chat({ model: 'openai/gpt-4o', messages: [], template_id: 'tpl_xxx', variables: { name: 'value' } });
   \`\`\`

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

  // Template tools
  registerCreateTemplate(server, opts);
  registerConfirmTemplate(server, opts);
  registerListTemplates(server, opts);
  registerGetTemplate(server, opts);
  registerUpdateTemplate(server, opts);

  return server;
}
