/**
 * MCP Tool: list_templates
 *
 * 列出项目私有模板 + 平台公共模板。查询类工具，不写审计日志。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListTemplates(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "list_templates",
    `List available prompt templates. Shows both project-private templates and platform public templates. Use search to filter by name/description. Returns template name, description, category, version count, and variable definitions.`,
    {
      search: z.string().optional().describe("Search keyword for name or description"),
      includePublic: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include platform public templates (default: true)"),
    },
    async ({ search, includePublic }) => {
      const conditions: object[] = [{ projectId }];
      if (includePublic) {
        conditions.push({ projectId: null });
      }

      const where: Record<string, unknown> = { OR: conditions };
      if (search) {
        where.AND = {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      const templates = await prisma.template.findMany({
        where,
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, variables: true },
          },
          _count: { select: { versions: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });

      const result = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        isPublic: t.projectId === null,
        activeVersionId: t.activeVersionId,
        versionCount: t._count.versions,
        latestVersion: t.versions[0] || null,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ templates: result, total: result.length }, null, 2),
          },
        ],
      };
    }
  );
}
