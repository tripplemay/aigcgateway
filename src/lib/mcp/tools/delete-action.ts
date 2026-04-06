/**
 * MCP Tool: delete_action
 *
 * 删除 Action（级联删除所有版本）。被 Template 引用时阻止删除。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerDeleteAction(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "delete_action",
    "Delete an Action and all its versions. Fails if the Action is used in any Template — remove it from Templates first.",
    {
      action_id: z.string().describe("Action ID to delete"),
    },
    async ({ action_id }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const action = await prisma.action.findFirst({
        where: { id: action_id, projectId },
      });
      if (!action) {
        return {
          content: [{ type: "text" as const, text: `Action "${action_id}" not found in this project.` }],
          isError: true,
        };
      }

      const usedInSteps = await prisma.templateStep.count({ where: { actionId: action_id } });
      if (usedInSteps > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot delete: Action is used in ${usedInSteps} template step(s). Remove it from templates first.`,
            },
          ],
          isError: true,
        };
      }

      await prisma.action.delete({ where: { id: action_id } });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ action_id, message: "Action deleted" }, null, 2) },
        ],
      };
    },
  );
}
