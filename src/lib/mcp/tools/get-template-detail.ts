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
    "Get full details of a Template including execution mode, step list with Action info, and reserved variables.",
    {
      template_id: z.string().describe("Template ID"),
    },
    async ({ template_id }) => {
      if (!projectId) {
        return {
          content: [{ type: "text" as const, text: "[no_project] No default project configured." }],
          isError: true,
        };
      }

      const template = await prisma.template.findFirst({
        where: { id: template_id, projectId },
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: {
              action: { select: { id: true, name: true, model: true, description: true } },
            },
          },
        },
      });

      if (!template) {
        return {
          content: [{ type: "text" as const, text: `Template "${template_id}" not found.` }],
          isError: true,
        };
      }

      const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");
      const executionMode =
        template.steps.length <= 1 ? "single" : hasSplitter ? "fan-out" : "sequential";

      const result = {
        id: template.id,
        name: template.name,
        description: template.description,
        executionMode,
        stepCount: template.steps.length,
        steps: template.steps.map((s) => ({
          order: s.order,
          role: s.role,
          actionId: s.action.id,
          actionName: s.action.name,
          model: s.action.model,
          actionDescription: s.action.description,
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
