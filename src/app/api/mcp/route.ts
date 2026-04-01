export const dynamic = "force-dynamic";

/**
 * MCP Streamable HTTP 端点
 *
 * POST /api/mcp — 客户端 JSON-RPC 请求
 * GET  /api/mcp — SSE 流（服务器推送）
 * DELETE /api/mcp — 终止 session
 *
 * 无状态模式：每个请求独立认证，不维护服务端 session。
 *
 * 安全措施：
 * - API Key 不允许出现在 URL 参数中
 * - 生产环境检查 Origin Header（警告但不阻断）
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateMcp } from "@/lib/mcp/auth";

/**
 * 安全检查：拒绝 URL 中包含 API Key 的请求
 */
function rejectUrlKey(request: Request): Response | null {
  const url = new URL(request.url);
  const suspectParams = ["key", "token", "apikey", "api_key", "authorization"];
  for (const param of suspectParams) {
    if (url.searchParams.has(param)) {
      return new Response(
        JSON.stringify({
          error: "BadRequest",
          message: "API key must be sent in the Authorization header, not in URL parameters.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  return null;
}

/**
 * Origin 检查：生产环境记录警告（不阻断，兼容 MCP 客户端）
 */
function checkOrigin(request: Request): void {
  if (process.env.NODE_ENV !== "production") return;
  const origin = request.headers.get("origin");
  if (origin) {
    // MCP 客户端（Claude Code / Cursor）通常不发 Origin
    // 浏览器请求会带 Origin — 记录但不阻断
    console.warn(`[mcp] Request with Origin header: ${origin}`);
  }
}

async function handleMcpRequest(request: Request): Promise<Response> {
  // 安全：拒绝 URL 中的 Key
  const urlKeyError = rejectUrlKey(request);
  if (urlKeyError) return urlKeyError;

  // 安全：Origin 检查
  checkOrigin(request);

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

  const server = createMcpServer({
    projectId: auth.project.id,
    permissions: auth.permissions,
    keyRateLimit: auth.apiKey.rateLimit,
  });
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
