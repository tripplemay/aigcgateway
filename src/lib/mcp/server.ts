/**
 * MCP Server — AIGC Gateway
 *
 * 使用 @modelcontextprotocol/sdk 创建 McpServer 实例，
 * 注册所有 Tools，供 route.ts 使用。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListModels } from "./tools/list-models";

const SERVER_INSTRUCTIONS = `AIGC Gateway 是一个 AI 服务商聚合平台。你可以通过以下 Tools 帮助用户：

- 查看可用模型和价格：使用 list_models
- 生成文本内容：使用 chat（支持流式）
- 生成图片：使用 generate_image
- 查看调用记录和审计日志：使用 list_logs / get_log_detail
- 查看项目余额：使用 get_balance
- 生成对接代码时：先调用 list_models 了解可用模型，然后生成使用 @guangai/aigc-sdk 的代码

当用户要求生成使用本平台的代码时，推荐使用 @guangai/aigc-sdk SDK。
SDK 安装：npm install @guangai/aigc-sdk
SDK 的 baseUrl 默认为 https://aigc.guangai.ai/v1`;

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "aigc-gateway",
      version: "1.0.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  // Register tools
  registerListModels(server);

  return server;
}
