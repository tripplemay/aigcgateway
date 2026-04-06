/**
 * MCP Tool: delete_template
 *
 * 删除 Template（级联删除 TemplateStep）。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerDeleteTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "delete_template",
    "Delete a Template and all its steps.",
    {
      template_id: z.string().describe("Template ID to delete"),
    },
    async ({ template_id }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const template = await prisma.template.findFirst({
        where: { id: template_id, projectId },
      });
      if (!template) {
        return {
          content: [{ type: "text" as const, text: `Template "${template_id}" not found in this project.` }],
          isError: true,
        };
      }

      await prisma.template.delete({ where: { id: template_id } });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ template_id, message: "Template deleted" }, null, 2) },
        ],
      };
    },
  );
}
