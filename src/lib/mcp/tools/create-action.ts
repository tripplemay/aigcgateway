/**
 * MCP Tool: create_action
 *
 * 创建新 Action + 首个版本并激活。
 * 写入类 Tool — 不写审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerCreateAction(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "create_action",
    "Create a new Action (atomic AI execution unit) with model, prompt messages, and optional variables. Automatically creates version 1 and sets it as active.",
    {
      name: z.string().describe("Action name"),
      description: z.string().optional().describe("Action description"),
      model: z.string().describe("Model name (must exist in list_models)"),
      messages: z
        .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }))
        .describe("Prompt message templates. Use {{variable}} for placeholders."),
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
        .describe("Variable definitions for the prompt template"),
    },
    async ({ name, description, model, messages, variables }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const action = await prisma.action.create({
        data: { projectId, name, description: description || null, model },
      });

      const version = await prisma.actionVersion.create({
        data: {
          actionId: action.id,
          versionNumber: 1,
          messages,
          variables: variables || [],
          changelog: "Initial version",
        },
      });

      await prisma.action.update({
        where: { id: action.id },
        data: { activeVersionId: version.id },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                action_id: action.id,
                name: action.name,
                model: action.model,
                active_version: version.versionNumber,
                message: "Action created successfully",
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
