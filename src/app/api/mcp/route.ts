export const dynamic = "force-dynamic";

/**
 * MCP Streamable HTTP 端点
 *
 * POST /api/mcp — 客户端 JSON-RPC 请求
 * GET  /api/mcp — SSE 流（服务器推送）
 * DELETE /api/mcp — 终止 session
 *
 * 无状态模式：每个请求独立认证，不维护服务端 session。
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateMcp } from "@/lib/mcp/auth";

async function handleMcpRequest(request: Request): Promise<Response> {
  // 认证
  const auth = await authenticateMcp(request);
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or missing API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 每个请求创建独立的 transport + server（无状态）
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 无状态模式
  });

  const server = createMcpServer();
  await server.connect(transport);

  // 将请求交给 transport 处理
  const response = await transport.handleRequest(request);

  return response;
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
