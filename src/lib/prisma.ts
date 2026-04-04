import { PrismaClient } from "@prisma/client";

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
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
