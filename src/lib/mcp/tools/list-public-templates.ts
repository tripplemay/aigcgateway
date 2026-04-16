/**
 * MCP Tool: list_public_templates
 *
 * 浏览公共模板库，返回管理员标记为公共的模板列表。
 * F-TL-05: 新增 category 过滤 + sort_by 参数 + averageScore / ratingCount 字段。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerOptions } from "@/lib/mcp/server";
import {
  listPublicTemplates,
  PUBLIC_TEMPLATE_SORT_VALUES,
} from "@/lib/public-templates";

export function registerListPublicTemplates(server: McpServer, _opts: McpServerOptions): void {
  server.tool(
    "list_public_templates",
    "Browse public template library. Supports category filter, sort_by (recommended/popular/top_rated/latest), averageScore + ratingCount + categoryIcon per item.",
    {
      search: z.string().optional().describe("Search by name or description"),
      category: z.string().optional().describe("Filter by category id (e.g. 'dev-review')"),
      sort_by: z
        .enum(PUBLIC_TEMPLATE_SORT_VALUES as [string, ...string[]])
        .optional()
        .describe("Sort order: recommended (default) / popular / top_rated / latest"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Items per page (default 20)"),
    },
    async ({ search, category, sort_by, page = 1, pageSize = 20 }) => {
      const { templates, pagination } = await listPublicTemplates({
        search,
        category,
        sortBy: sort_by as
          | "recommended"
          | "popular"
          | "top_rated"
          | "latest"
          | undefined,
        page,
        pageSize,
      });

      const data = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        categoryIcon: t.categoryIcon,
        averageScore: t.averageScore,
        ratingCount: t.ratingCount,
        forkCount: t.forkCount,
        stepCount: t.stepCount,
        executionMode: t.executionMode,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                templates: data,
                pagination: {
                  page: pagination.page,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                },
                sortBy: sort_by ?? "recommended",
                category: category ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
