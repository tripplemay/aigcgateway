/**
 * GET /api/mcp/tools — BL-MCP-PAGE-REVAMP F-MR-01
 *
 * 返回所有已注册的 MCP tool 元数据，供 /mcp-setup 页面动态渲染。
 *
 * 公开端点：不要求认证（与 /api/v1/models 一致），方便文档站和未登录用户
 * 浏览能力清单。
 */

import { NextResponse } from "next/server";
import { MCP_TOOL_REGISTRY } from "@/lib/mcp/tool-registry";

export const dynamic = "force-static";
export const revalidate = 3600; // 1h；registry 改动需要部署 + ISR 自动更新

export async function GET() {
  return NextResponse.json({ data: MCP_TOOL_REGISTRY });
}
