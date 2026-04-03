/**
 * MCP Tool: get_template
 *
 * 获取指定模板详情 + 所有版本 + 变量定义。查询类工具。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "get_template",
    `Get detailed information about a specific prompt template, including all versions, messages, and variable definitions. Works for both project-private and public templates.`,
    {
      templateId: z.string().describe("Template ID"),
    },
    async ({ templateId }) => {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            select: {
              id: true,
              versionNumber: true,
              messages: true,
              variables: true,
              changelog: true,
              createdAt: true,
            },
          },
        },
      });

      if (!template) {
        return {
          content: [{ type: "text" as const, text: `Template not found: ${templateId}` }],
          isError: true,
        };
      }

      // 只能查看自己项目的模板或公共模板
      if (template.projectId !== null && template.projectId !== projectId) {
        return {
          content: [{ type: "text" as const, text: "Access denied: template belongs to another project" }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: template.id,
                name: template.name,
                description: template.description,
                category: template.category,
                isPublic: template.projectId === null,
                activeVersionId: template.activeVersionId,
                forkedFromId: template.forkedFromId,
                versions: template.versions,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
