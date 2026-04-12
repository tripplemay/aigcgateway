/**
 * MCP Tool: activate_version
 *
 * 设置 Action 的活跃版本（版本回滚/切换）。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerActivateVersion(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "activate_version",
    "Set the active version for an Action. Use this to roll back to a previous version or promote a specific version.",
    {
      action_id: z.string().describe("Action ID"),
      version_id: z.string().describe("Version ID to activate"),
    },
    async ({ action_id, version_id }) => {
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

      const version = await prisma.actionVersion.findFirst({
        where: { id: version_id, actionId: action_id },
      });
      if (!version) {
        return {
          content: [
            { type: "text" as const, text: `Version "${version_id}" not found for this action.` },
          ],
          isError: true,
        };
      }

      await prisma.action.update({
        where: { id: action_id },
        data: { activeVersionId: version_id },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                action_id,
                active_version_id: version_id,
                version_number: version.versionNumber,
                message: "Version activated",
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
