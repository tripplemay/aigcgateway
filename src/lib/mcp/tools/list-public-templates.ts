/**
 * MCP Tool: list_public_templates
 *
 * 浏览公共模板库，返回管理员标记为公共的模板列表。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListPublicTemplates(server: McpServer, _opts: McpServerOptions): void {
  server.tool(
    "list_public_templates",
    "Browse public template library. Returns templates marked as public by administrators, with quality scores and fork counts.",
    {
      search: z.string().optional().describe("Search by name or description"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page (default 20)"),
    },
    async ({ search, page = 1, pageSize = 20 }) => {
      const where: Record<string, unknown> = { isPublic: true };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const [templates, total] = await Promise.all([
        prisma.template.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            qualityScore: true,
            updatedAt: true,
            steps: { orderBy: { order: "asc" }, select: { role: true } },
            _count: { select: { forks: true } },
          },
          orderBy: { qualityScore: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.template.count({ where }),
      ]);

      const data = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        qualityScore: t.qualityScore,
        forkCount: t._count.forks,
        stepCount: t.steps.length,
        executionMode: t.steps.some((s) => s.role === "SPLITTER")
          ? "fan-out"
          : t.steps.length > 1
            ? "sequential"
            : "single",
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ templates: data, pagination: { page, pageSize, total } }, null, 2),
          },
        ],
      };
    },
  );
}
