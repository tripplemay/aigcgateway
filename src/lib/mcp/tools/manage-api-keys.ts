/**
 * MCP Tools: list_api_keys / create_api_key / revoke_api_key
 *
 * API Key 管理工具 — 查看、创建、吊销 API Key。
 * 管理类 Tool —— 不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListApiKeys(server: McpServer, opts: McpServerOptions): void {
  const { userId, permissions } = opts;

  server.tool(
    "list_api_keys",
    `List all API keys for the current user. Returns masked key prefix, name, status, and creation date.`,
    {},
    async () => {
      const permErr = checkMcpPermission(permissions, "keyManagement");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const keys = await prisma.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          keyPrefix: true,
          name: true,
          status: true,
          createdAt: true,
          lastUsedAt: true,
        },
      });

      const data = keys.map((k) => ({
        id: k.id,
        maskedKey: `${k.keyPrefix}...****`,
        name: k.name,
        status: k.status.toLowerCase(),
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}

export function registerCreateApiKey(server: McpServer, opts: McpServerOptions): void {
  const { userId, permissions } = opts;

  server.tool(
    "create_api_key",
    `Create a new API key for the current user. The full key is returned ONLY ONCE — save it immediately.`,
    {
      name: z.string().describe("A name for the API key (e.g. 'Production', 'Dev')"),
      description: z.string().optional().describe("Optional description"),
    },
    async ({ name, description }) => {
      const permErr = checkMcpPermission(permissions, "keyManagement");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const rawKey = `pk_${randomBytes(32).toString("hex")}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 8);

      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          keyHash,
          keyPrefix,
          name,
          description: description ?? null,
          status: "ACTIVE",
          permissions: {},
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: apiKey.id,
                key: rawKey,
                name: apiKey.name,
                status: "active",
                createdAt: apiKey.createdAt.toISOString(),
                warning: "Save this key now — it will NOT be shown again.",
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

export function registerRevokeApiKey(server: McpServer, opts: McpServerOptions): void {
  const { userId, permissions } = opts;

  server.tool(
    "revoke_api_key",
    `Revoke (disable) an API key. The key will immediately stop working.`,
    {
      keyId: z.string().describe("The ID of the API key to revoke"),
    },
    async ({ keyId }) => {
      const permErr = checkMcpPermission(permissions, "keyManagement");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Verify ownership
      const key = await prisma.apiKey.findUnique({
        where: { id: keyId },
        select: { id: true, userId: true, status: true, name: true },
      });

      if (!key || key.userId !== userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[not_found] API key "${keyId}" not found or does not belong to you.`,
            },
          ],
          isError: true,
        };
      }

      if (key.status === "REVOKED") {
        return {
          content: [
            {
              type: "text" as const,
              text: `API key "${key.name ?? keyId}" is already revoked.`,
            },
          ],
        };
      }

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { status: "REVOKED" },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: keyId,
                name: key.name,
                status: "revoked",
                message: "API key has been revoked and will no longer work.",
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
