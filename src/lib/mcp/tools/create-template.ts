/**
 * MCP Tool: create_template
 *
 * 根据自然语言描述生成模板草稿（messages + variables），不写入数据库。
 * 配合 confirm_template 使用。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerCreateTemplate(server: McpServer, _opts: McpServerOptions): void {
  server.tool(
    "create_template",
    `Generate a prompt template draft from a natural language description. Returns a draft JSON with messages array and variables definitions. The draft is NOT saved to database — use confirm_template to save it. Useful for quickly scaffolding reusable prompts.`,
    {
      description: z
        .string()
        .describe(
          "Natural language description of what the template should do, e.g. 'a template that translates text to a target language with adjustable tone'"
        ),
    },
    async ({ description }) => {
      // 根据描述生成草稿结构
      // 从描述中提取可能的变量
      const variablePattern = /(?:(\w+)\s*(?:parameter|variable|input|参数|变量))|(?:target\s+(\w+))|(?:input\s+(\w+))/gi;
      const foundVars: string[] = [];
      let match;
      while ((match = variablePattern.exec(description)) !== null) {
        const varName = match[1] || match[2] || match[3];
        if (varName && !foundVars.includes(varName.toLowerCase())) {
          foundVars.push(varName.toLowerCase());
        }
      }

      // 如果没有从描述中提取到变量，添加一个默认的 input 变量
      if (foundVars.length === 0) {
        foundVars.push("input");
      }

      const variables = foundVars.map((name) => ({
        name,
        description: `Variable: ${name}`,
        required: true,
      }));

      const variablePlaceholders = foundVars.map((v) => `{{${v}}}`).join(", ");

      const draft = {
        messages: [
          {
            role: "system",
            content: `You are an AI assistant. ${description}`,
          },
          {
            role: "user",
            content: variablePlaceholders,
          },
        ],
        variables,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                draft,
                hint: "Review and edit this draft, then use confirm_template to save it. You can modify messages and variables before confirming.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
