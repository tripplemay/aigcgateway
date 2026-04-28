/**
 * GET /api/mcp/tools — BL-MCP-PAGE-REVAMP F-MR-01
 *
 * 返回所有已注册的 MCP tool 元数据，供 /mcp-setup 页面动态渲染。
 *
 * 公开端点：不要求认证（与 /api/v1/models 一致），方便文档站和未登录用户
 * 浏览能力清单。
 *
 * fix-round-2: 改为 force-dynamic 与项目其他 API route 一致（chat /
 * embeddings 等都用 force-dynamic）。原 force-static + revalidate=3600
 * 的 ISR 配置在某些 standalone 沙盒构建下可能不完整生成 prerendered output，
 * 引发 502 cascade（Codex round2 现象）。registry 是纯内存 const，
 * dynamic 路由开销极低（就是返回 const + JSON.stringify）。
 */

import { NextResponse } from "next/server";
import { MCP_TOOL_REGISTRY } from "@/lib/mcp/tool-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: MCP_TOOL_REGISTRY });
}
