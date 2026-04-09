/**
 * MCP Tool: fork_public_template
 *
 * Fork 一个公共模板到当前项目，深拷贝 Template + Steps + Actions。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpServerOptions } from "@/lib/mcp/server";
import type { Prisma } from "@prisma/client";

export function registerForkPublicTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId } = opts;

  server.tool(
    "fork_public_template",
    "Fork a public template and its associated Actions to your project. Creates independent copies you can freely edit.",
    {
      templateId: z.string().describe("ID of the public template to fork"),
    },
    async ({ templateId }) => {
      // Load source
      const source = await prisma.template.findFirst({
        where: { id: templateId, isPublic: true },
        include: {
          steps: {
            orderBy: { order: "asc" },
            select: { actionId: true, order: true, role: true },
          },
        },
      });

      if (!source) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Public template not found" }) }],
          isError: true,
        };
      }

      // Load source actions with latest versions
      const sourceActionIds = [...new Set(source.steps.map((s) => s.actionId))];
      const sourceActions = await prisma.action.findMany({
        where: { id: { in: sourceActionIds } },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      });
      const actionMap = new Map(sourceActions.map((a) => [a.id, a]));

      const result = await prisma.$transaction(async (tx) => {
        // Deep copy Actions
        const actionIdMapping = new Map<string, string>();
        for (const srcId of sourceActionIds) {
          const src = actionMap.get(srcId);
          if (!src) continue;

          const existing = await tx.action.findFirst({
            where: { projectId, name: src.name },
          });

          if (existing) {
            actionIdMapping.set(srcId, existing.id);
          } else {
            const newAction = await tx.action.create({
              data: {
                projectId,
                name: src.name,
                description: src.description,
                model: src.model,
              },
            });
            const latestVersion = src.versions[0];
            if (latestVersion) {
              await tx.actionVersion.create({
                data: {
                  actionId: newAction.id,
                  versionNumber: 1,
                  messages: latestVersion.messages as Prisma.InputJsonValue,
                  variables: latestVersion.variables as Prisma.InputJsonValue,
                  changelog: "Forked from public template",
                },
              });
            }
            actionIdMapping.set(srcId, newAction.id);
          }
        }

        // Create forked template
        const forked = await tx.template.create({
          data: {
            projectId,
            name: source.name,
            description: source.description,
            sourceTemplateId: source.id,
            isPublic: false,
          },
        });

        // Copy steps
        for (const step of source.steps) {
          const mappedActionId = actionIdMapping.get(step.actionId);
          if (!mappedActionId) continue;
          await tx.templateStep.create({
            data: {
              templateId: forked.id,
              actionId: mappedActionId,
              order: step.order,
              role: step.role,
            },
          });
        }

        return forked;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                forkedTemplate: { id: result.id, name: result.name },
                copiedActions: sourceActionIds.length,
                message: `Template "${source.name}" forked successfully to your project.`,
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
