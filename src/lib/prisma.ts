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

const PRICE_DECIMALS = 6;

function roundTo6(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    const factor = 10 ** PRICE_DECIMALS;
    return Math.round(value * factor) / factor;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const factor = 10 ** PRICE_DECIMALS;
      return Math.round(n * factor) / factor;
    }
  }
  return value;
}

function normalizePriceObject(price: unknown): void {
  if (!price || typeof price !== "object" || Array.isArray(price)) return;
  const p = price as Record<string, unknown>;
  // Infer unit if missing
  if (!p.unit) {
    if (p.inputPer1M !== undefined || p.outputPer1M !== undefined) {
      p.unit = "token";
    } else if (p.perCall !== undefined) {
      p.unit = "call";
    }
  }
  // Round numeric price fields to 6 decimals (F-DP-01: 精度保障)
  if (p.inputPer1M !== undefined) p.inputPer1M = roundTo6(p.inputPer1M);
  if (p.outputPer1M !== undefined) p.outputPer1M = roundTo6(p.outputPer1M);
  if (p.perCall !== undefined) p.perCall = roundTo6(p.perCall);
}

/**
 * 统一处理 ModelAlias / Channel 写入时的 sellPrice/costPrice：
 * 1) 自动推断 unit 字段
 * 2) 数值 round 到 6 位小数，避免浮点尾噪
 */
function ensureSellPriceUnit(data: Record<string, unknown> | undefined) {
  if (!data) return;
  normalizePriceObject(data.sellPrice);
  normalizePriceObject(data.costPrice);
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
          ensureSellPriceUnit(args.data as Record<string, unknown>);
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
        async updateMany({ args, query }) {
          ensureSellPriceUnit(args.data as Record<string, unknown>);
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
