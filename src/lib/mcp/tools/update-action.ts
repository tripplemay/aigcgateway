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
    "Update an Action's metadata (name, description, model). When the model is changed, a new version is automatically created to preserve history.",
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
          content: [
            {
              type: "text" as const,
              text: "[no_project] No project found. Use create_project to create one.",
            },
          ],
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

      // F-AF2-07: when model changes, auto-create a new version to preserve history
      let newVersionInfo: { version_id: string; version_number: number } | null = null;
      if (model !== undefined && model !== action.model && action.activeVersionId) {
        const activeVersion = await prisma.actionVersion.findFirst({
          where: { id: action.activeVersionId, actionId: action_id },
        });
        if (activeVersion) {
          const lastVersion = await prisma.actionVersion.findFirst({
            where: { actionId: action_id },
            orderBy: { versionNumber: "desc" },
          });
          const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
          const newVersion = await prisma.actionVersion.create({
            data: {
              actionId: action_id,
              versionNumber: nextVersion,
              messages: activeVersion.messages as object,
              variables: (activeVersion.variables as object) ?? [],
              changelog: `Model changed from ${action.model} to ${model}`,
            },
          });
          data.activeVersionId = newVersion.id;
          newVersionInfo = {
            version_id: newVersion.id,
            version_number: newVersion.versionNumber,
          };
        }
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
                message: newVersionInfo
                  ? `Action updated. New version v${newVersionInfo.version_number} created (model changed).`
                  : "Action updated",
                ...(newVersionInfo ?? {}),
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
