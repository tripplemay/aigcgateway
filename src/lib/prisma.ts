import { PrismaClient } from "@prisma/client";
import { invalidateModelsListCache } from "@/lib/cache/models-cache";

/**
 * 生产和开发都将实例挂到 globalThis，防止：
 * - Next.js HMR 重复创建连接池（开发）
 * - PM2 多进程 require 重复创建（生产）
 *
 * 连接池参数建议在 DATABASE_URL 末尾追加（部署侧控制）：
 *   ?connection_limit=5&pool_timeout=2
 *   connection_limit=5  — 1GB VPS 适用，不宜过大
 *   pool_timeout=2      — 等待可用连接超时 2 秒，快速失败
 */

function ensureSellPriceUnit(data: Record<string, unknown> | undefined) {
  if (!data?.sellPrice || typeof data.sellPrice !== "object" || Array.isArray(data.sellPrice))
    return;
  const sp = data.sellPrice as Record<string, unknown>;
  if (sp.unit) return;
  if (sp.inputPer1M !== undefined || sp.outputPer1M !== undefined) {
    sp.unit = "token";
  } else if (sp.perCall !== undefined) {
    sp.unit = "call";
  }
}

function createExtendedClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      modelAlias: {
        async create({ args, query }) {
          ensureSellPriceUnit(args.data as Record<string, unknown>);
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async update({ args, query }) {
          ensureSellPriceUnit(args.data as Record<string, unknown>);
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async upsert({ args, query }) {
          ensureSellPriceUnit(
            (args as { update?: Record<string, unknown> }).update as
              | Record<string, unknown>
              | undefined,
          );
          ensureSellPriceUnit(
            (args as { create?: Record<string, unknown> }).create as
              | Record<string, unknown>
              | undefined,
          );
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async delete({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async deleteMany({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async updateMany({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
      },
      model: {
        async create({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async update({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async upsert({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async delete({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async updateMany({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
      },
      channel: {
        async create({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async update({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async upsert({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async delete({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async updateMany({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
      },
      aliasModelLink: {
        async create({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async delete({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
        async deleteMany({ args, query }) {
          const res = await query(args);
          invalidateModelsListCache();
          return res;
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createExtendedClient();

globalForPrisma.prisma = prisma;
