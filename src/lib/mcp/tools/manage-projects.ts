/**
 * MCP Tools: get_project_info / create_project
 *
 * 项目管理工具 — 查看当前项目信息，创建新项目。
 * 管理类 Tool —— 不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetProjectInfo(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, permissions } = opts;

  server.tool(
    "get_project_info",
    `Get information about the current project, including name, description, API call count, and API key count.`,
    {},
    async () => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      if (!projectId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message:
                    "No default project configured. Use create_project to create one, or set a default project in the console.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          _count: {
            select: {
              callLogs: true,
            },
          },
        },
      });

      if (!project) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[not_found] Project "${projectId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      // Count API keys belonging to this user
      const keyCount = await prisma.apiKey.count({
        where: { userId },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: project.id,
                name: project.name,
                description: project.description,
                createdAt: project.createdAt.toISOString(),
                callCount: project._count.callLogs,
                keyCount,
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

export function registerCreateProject(server: McpServer, opts: McpServerOptions): void {
  const { userId, permissions } = opts;

  server.tool(
    "create_project",
    `Create a new project and set it as the default project for this user.`,
    {
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Optional project description"),
    },
    async ({ name, description }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const project = await prisma.project.create({
        data: {
          userId,
          name,
          description: description ?? null,
        },
      });

      // Set as default project for this user
      await prisma.user.update({
        where: { id: userId },
        data: { defaultProjectId: project.id },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: project.id,
                name: project.name,
                description: project.description,
                createdAt: project.createdAt.toISOString(),
                message: "Project created and set as default.",
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
