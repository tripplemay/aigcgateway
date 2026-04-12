/**
 * MCP Tool: update_action
 *
 * 更新 Action 元数据（name/description/model），不创建新版本。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerUpdateAction(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "update_action",
    "Update an Action's metadata (name, description, model). Does not create a new version — use create_action_version for that.",
    {
      action_id: z.string().describe("Action ID to update"),
      name: z.string().optional().describe("New action name"),
      description: z.string().optional().describe("New description"),
      model: z.string().optional().describe("New model name"),
    },
    async ({ action_id, name, description, model }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }
      if (!projectId) {
        return {
          content: [{ type: "text" as const, text: "[no_project] No project found. Use create_project to create one." }],
          isError: true,
        };
      }

      const action = await prisma.action.findFirst({
        where: { id: action_id, projectId },
      });
      if (!action) {
        return {
          content: [
            { type: "text" as const, text: `Action "${action_id}" not found in this project.` },
          ],
          isError: true,
        };
      }

      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (model !== undefined) data.model = model;

      if (Object.keys(data).length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No fields to update. Provide at least one of: name, description, model.",
            },
          ],
          isError: true,
        };
      }

      const updated = await prisma.action.update({ where: { id: action_id }, data });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                action_id: updated.id,
                name: updated.name,
                model: updated.model,
                message: "Action updated",
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
