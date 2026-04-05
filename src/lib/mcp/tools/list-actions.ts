/**
 * MCP Tool: list_actions
 *
 * 列出当前项目所有 Actions，含名称、描述、模型、激活版本。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListActions(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "list_actions",
    "List all Actions in the current project. Each Action is an atomic execution unit with a bound model, prompt messages, and variables.",
    {
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page (default 20)"),
    },
    async ({ page = 1, pageSize = 20 }) => {
      const actions = await prisma.action.findMany({
        where: { projectId },
        include: {
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      const total = await prisma.action.count({ where: { projectId } });

      const data = actions.map((a) => {
        const activeVer = a.versions.find((v) => v.id === a.activeVersionId) ?? a.versions[0];
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          model: a.model,
          activeVersion: activeVer
            ? { versionNumber: activeVer.versionNumber, variableCount: (activeVer.variables as unknown[]).length }
            : null,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ data, pagination: { page, pageSize, total } }, null, 2),
          },
        ],
      };
    },
  );
}
