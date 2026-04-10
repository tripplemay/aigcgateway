/**
 * MCP Tool: update_template
 *
 * 更新 Template 元数据和/或步骤。步骤提供时全量替换。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerUpdateTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "update_template",
    "Update a Template's name, description, and/or steps. When steps are provided, they fully replace all existing steps.",
    {
      template_id: z.string().describe("Template ID to update"),
      name: z.string().optional().describe("New template name"),
      description: z.string().optional().describe("New description"),
      steps: z
        .array(
          z.object({
            action_id: z.string(),
            role: z.enum(["SEQUENTIAL", "SPLITTER", "BRANCH", "MERGE"]).optional(),
          }),
        )
        .optional()
        .describe("New steps (full replacement). Omit to keep existing steps."),
    },
    async ({ template_id, name, description, steps }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }
      if (!projectId) {
        return {
          content: [{ type: "text" as const, text: "[no_project] No default project configured." }],
          isError: true,
        };
      }

      const template = await prisma.template.findFirst({
        where: { id: template_id, projectId },
      });
      if (!template) {
        return {
          content: [
            { type: "text" as const, text: `Template "${template_id}" not found in this project.` },
          ],
          isError: true,
        };
      }

      // Update metadata
      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;

      // Replace steps if provided — validate first
      if (steps) {
        const actionIds = steps.map((s) => s.action_id);
        const actions = await prisma.action.findMany({
          where: { id: { in: actionIds }, projectId },
          select: { id: true },
        });
        const validIds = new Set(actions.map((a) => a.id));
        const invalidIds = actionIds.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Action IDs not found in this project: ${invalidIds.join(", ")}`,
              },
            ],
            isError: true,
          };
        }
      }

      try {
        if (Object.keys(data).length > 0) {
          await prisma.template.update({ where: { id: template_id }, data });
        }

        if (steps) {
          await prisma.templateStep.deleteMany({ where: { templateId: template_id } });
          await prisma.templateStep.createMany({
            data: steps.map((s, i) => ({
              templateId: template_id,
              actionId: s.action_id,
              order: i + 1,
              role: s.role || "SEQUENTIAL",
            })),
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ template_id, message: "Template updated" }, null, 2),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Template update failed";
        return {
          content: [{ type: "text" as const, text: `[internal_error] ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
