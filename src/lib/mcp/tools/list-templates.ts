/**
 * MCP Tool: list_templates
 *
 * 列出当前项目所有 Templates，含名称、描述、步骤数、执行模式摘要。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListTemplates(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "list_templates",
    "List all Templates in the current project. Templates orchestrate one or more Actions into sequential or fan-out workflows.",
    {
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page (default 20)"),
    },
    async ({ page = 1, pageSize = 20 }) => {
      if (!projectId) {
        return {
          content: [{ type: "text" as const, text: "[no_project] No project found. Use create_project to create one." }],
          isError: true,
        };
      }

      const templates = await prisma.template.findMany({
        where: { projectId },
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: { action: { select: { name: true, model: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      const total = await prisma.template.count({ where: { projectId } });

      const data = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        stepCount: t.steps.length,
        executionMode: t.steps.some((s) => s.role === "SPLITTER")
          ? "fan-out"
          : t.steps.length > 1
            ? "sequential"
            : "single",
        steps: t.steps.map((s) => ({
          order: s.order,
          role: s.role,
          actionName: s.action.name,
          model: s.action.model,
        })),
      }));

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://aigc.guangai.ai";
      const result: Record<string, unknown> = { data, pagination: { page, pageSize, total } };
      if (data.length === 0) {
        result.message = `No Templates found. Create your first Template in the console at ${baseUrl}/templates`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
