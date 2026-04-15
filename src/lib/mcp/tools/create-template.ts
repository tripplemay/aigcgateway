/**
 * MCP Tool: create_template
 *
 * 创建新 Template（多步编排工作流）。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerCreateTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "create_template",
    "Create a new Template (multi-step workflow). Steps reference existing Actions by ID. Order is determined by array position.",
    {
      name: z.string().describe("Template name"),
      description: z.string().optional().describe("Template description"),
      steps: z
        .array(
          z.object({
            action_id: z.string().describe("Action ID for this step"),
            // F-WP-03: optional lock to a specific ActionVersion. If omitted,
            // run_template uses whichever version is active at runtime.
            version_id: z
              .string()
              .optional()
              .describe(
                "Pin this step to a specific ActionVersion id. Omit to follow the action's active version.",
              ),
            role: z
              .enum(["SEQUENTIAL", "SPLITTER", "BRANCH", "MERGE"])
              .optional()
              .describe("Step role (default: SEQUENTIAL)"),
          }),
        )
        .describe("Steps array. Order determined by position in array."),
    },
    async ({ name, description, steps }) => {
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

      // Validate all action_ids belong to this project
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

      // F-WP-03: validate any pinned version_ids actually belong to their step's action.
      const pinnedPairs = steps
        .filter((s) => typeof s.version_id === "string" && s.version_id.length > 0)
        .map((s) => ({ actionId: s.action_id, versionId: s.version_id as string }));
      if (pinnedPairs.length > 0) {
        const versions = await prisma.actionVersion.findMany({
          where: { id: { in: pinnedPairs.map((p) => p.versionId) } },
          select: { id: true, actionId: true },
        });
        const vMap = new Map(versions.map((v) => [v.id, v.actionId]));
        const mismatches = pinnedPairs.filter((p) => vMap.get(p.versionId) !== p.actionId);
        if (mismatches.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid version_id lock: ${mismatches
                  .map((m) => `${m.versionId}→${m.actionId}`)
                  .join(", ")}`,
              },
            ],
            isError: true,
          };
        }
      }

      try {
        const template = await prisma.template.create({
          data: {
            projectId,
            name,
            description: description || null,
            steps: {
              create: steps.map((s, i) => ({
                actionId: s.action_id,
                lockedVersionId: s.version_id ?? null,
                order: i + 1,
                role: s.role || "SEQUENTIAL",
              })),
            },
          },
          include: { steps: { orderBy: { order: "asc" } } },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  template_id: template.id,
                  name: template.name,
                  step_count: template.steps.length,
                  message: "Template created successfully",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Template creation failed";
        return {
          content: [{ type: "text" as const, text: `[internal_error] ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
