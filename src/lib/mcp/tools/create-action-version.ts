/**
 * MCP Tool: create_action_version
 *
 * 为已有 Action 创建新版本。版本号自动递增。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerCreateActionVersion(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "create_action_version",
    "Create a new version for an existing Action. Version number auto-increments. By default the new version becomes the active version.",
    {
      action_id: z.string().describe("Target Action ID"),
      messages: z
        .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }))
        .describe("New version's prompt messages"),
      variables: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            required: z.boolean().optional(),
            defaultValue: z.string().optional(),
          }),
        )
        .optional()
        .describe("New version's variable definitions"),
      changelog: z.string().optional().describe("Version changelog description"),
      set_active: z.boolean().optional().describe("Set this version as active (default: true)"),
    },
    async ({ action_id, messages, variables, changelog, set_active }) => {
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

      const lastVersion = await prisma.actionVersion.findFirst({
        where: { actionId: action_id },
        orderBy: { versionNumber: "desc" },
      });
      const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

      const version = await prisma.actionVersion.create({
        data: {
          actionId: action_id,
          versionNumber: nextVersion,
          messages,
          variables: variables || [],
          changelog: changelog || null,
        },
      });

      if (set_active !== false) {
        await prisma.action.update({
          where: { id: action_id },
          data: { activeVersionId: version.id },
        });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                action_id,
                version_id: version.id,
                version_number: version.versionNumber,
                is_active: set_active !== false,
                message: "Version created",
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
