/**
 * MCP Tool: get_template_detail
 *
 * 查看 Template 详情：基本信息、执行模式、步骤列表（含 Action 信息）。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetTemplateDetail(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "get_template_detail",
    "Get full details of a Template including execution mode, step list with Action info, and reserved variables. Also supports previewing public templates (read-only, cross-project).",
    {
      template_id: z.string().describe("Template ID"),
    },
    async ({ template_id }) => {
      const templateInclude = {
        steps: {
          orderBy: { order: "asc" as const },
          include: {
            action: {
              select: {
                id: true,
                name: true,
                model: true,
                description: true,
                activeVersionId: true,
              },
            },
          },
        },
      };

      // First try own project, then fall back to public templates (read-only preview)
      let template = projectId
        ? await prisma.template.findFirst({
            where: { id: template_id, projectId },
            include: templateInclude,
          })
        : null;

      let isPublicPreview = false;
      if (!template) {
        // Check if it's a public template (cross-project read-only)
        template = await prisma.template.findFirst({
          where: { id: template_id, isPublic: true },
          include: templateInclude,
        });
        if (template) isPublicPreview = true;
      }

      if (!template) {
        return {
          content: [
            { type: "text" as const, text: `Template "${template_id}" not found in this project.` },
          ],
          isError: true,
        };
      }

      const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");
      const executionMode =
        template.steps.length <= 1 ? "single" : hasSplitter ? "fan-out" : "sequential";

      // F-WP-04: resolve active and locked ActionVersion numbers for each step.
      const versionIds = Array.from(
        new Set(
          template.steps.flatMap((s) =>
            [s.action.activeVersionId, s.lockedVersionId].filter(
              (v): v is string => typeof v === "string",
            ),
          ),
        ),
      );
      const versionRows = versionIds.length
        ? await prisma.actionVersion.findMany({
            where: { id: { in: versionIds } },
            select: { id: true, versionNumber: true },
          })
        : [];
      const versionNumberMap = new Map(versionRows.map((v) => [v.id, v.versionNumber]));

      const result = {
        id: template.id,
        name: template.name,
        description: template.description,
        ...(isPublicPreview
          ? {
              isPublicPreview: true,
              hint: "Use fork_public_template to fork this template into your project.",
            }
          : {}),
        executionMode,
        stepCount: template.steps.length,
        steps: template.steps.map((s) => ({
          order: s.order,
          role: s.role,
          actionId: s.action.id,
          actionName: s.action.name,
          model: s.action.model,
          actionDescription: s.action.description,
          activeVersionId: s.action.activeVersionId ?? null,
          activeVersionNumber: s.action.activeVersionId
            ? (versionNumberMap.get(s.action.activeVersionId) ?? null)
            : null,
          ...(s.lockedVersionId
            ? {
                lockedVersionId: s.lockedVersionId,
                lockedVersionNumber: versionNumberMap.get(s.lockedVersionId) ?? null,
              }
            : {}),
        })),
        reservedVariables:
          executionMode === "single"
            ? []
            : executionMode === "sequential"
              ? ["{{previous_output}}"]
              : ["{{branch_input}}", "{{all_outputs}}"],
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
