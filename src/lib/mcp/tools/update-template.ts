/**
 * MCP Tool: update_template
 *
 * 为已有模板创建新版本（不自动切换活跃版本）。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const variableSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

export function registerUpdateTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "update_template",
    `Create a new version for an existing template. The new version is NOT automatically set as active — use the console to switch active versions. Returns the new version details.`,
    {
      templateId: z.string().describe("Template ID to update"),
      messages: z.array(messageSchema).describe("Updated messages array"),
      variables: z.array(variableSchema).describe("Updated variable definitions"),
      changelog: z.string().optional().describe("What changed in this version"),
    },
    async ({ templateId, messages, variables, changelog }) => {
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const template = await prisma.template.findUnique({ where: { id: templateId } });
      if (!template) {
        return {
          content: [{ type: "text" as const, text: `Template not found: ${templateId}` }],
          isError: true,
        };
      }

      if (template.projectId !== null && template.projectId !== projectId) {
        return {
          content: [{ type: "text" as const, text: "Access denied: template belongs to another project" }],
          isError: true,
        };
      }

      const latest = await prisma.templateVersion.findFirst({
        where: { templateId },
        orderBy: { versionNumber: "desc" },
      });

      const version = await prisma.templateVersion.create({
        data: {
          templateId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          messages,
          variables,
          changelog: changelog || null,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                templateId,
                versionId: version.id,
                versionNumber: version.versionNumber,
                changelog: version.changelog,
                message:
                  "New version created. Note: this version is NOT active yet. Switch active version via the console.",
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
