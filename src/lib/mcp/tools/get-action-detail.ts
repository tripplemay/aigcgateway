/**
 * MCP Tool: get_action_detail
 *
 * 查看 Action 详情：基本信息、激活版本内容、版本列表。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetActionDetail(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "get_action_detail",
    "Get full details of an Action including its active version's messages and variables, plus version history.",
    {
      action_id: z.string().describe("Action ID"),
    },
    async ({ action_id }) => {
      if (!projectId) {
        return {
          content: [{ type: "text" as const, text: "[no_project] No project found. Use create_project to create one." }],
          isError: true,
        };
      }

      const action = await prisma.action.findFirst({
        where: { id: action_id, projectId },
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
        },
      });

      if (!action) {
        return {
          content: [{ type: "text" as const, text: `Action "${action_id}" not found.` }],
          isError: true,
        };
      }

      const activeVersion = action.versions.find((v) => v.id === action.activeVersionId);

      const result = {
        id: action.id,
        name: action.name,
        description: action.description,
        model: action.model,
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              versionNumber: activeVersion.versionNumber,
              messages: activeVersion.messages,
              variables: activeVersion.variables,
              changelog: activeVersion.changelog,
              createdAt: activeVersion.createdAt,
            }
          : null,
        versions: action.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          createdAt: v.createdAt,
          isActive: v.id === action.activeVersionId,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
