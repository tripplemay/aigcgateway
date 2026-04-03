/**
 * MCP Tool: confirm_template
 *
 * 确认并保存 create_template 生成的草稿。写入 Template + TemplateVersion。
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

export function registerConfirmTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "confirm_template",
    `Save a template draft (from create_template or manually composed) to the database. Creates a Template with its first version. Returns the saved template with version details.`,
    {
      name: z.string().describe("Template name"),
      description: z.string().optional().describe("Template description"),
      messages: z.array(messageSchema).describe("Messages array with {{variable}} placeholders"),
      variables: z.array(variableSchema).describe("Variable definitions"),
    },
    async ({ name, description, messages, variables }) => {
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      try {
        const template = await prisma.template.create({
          data: {
            projectId,
            name,
            description: description || null,
            createdBy: "mcp",
          },
        });

        const version = await prisma.templateVersion.create({
          data: {
            templateId: template.id,
            versionNumber: 1,
            messages,
            variables,
            changelog: "Initial version via MCP",
          },
        });

        await prisma.template.update({
          where: { id: template.id },
          data: { activeVersionId: version.id },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  templateId: template.id,
                  name: template.name,
                  versionId: version.id,
                  versionNumber: version.versionNumber,
                  variableCount: variables.length,
                  message: "Template saved successfully.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Failed to save template: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
