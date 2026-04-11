import { prisma } from "@/lib/prisma";
import type { Prisma, SystemLogCategory, SystemLogLevel } from "@prisma/client";

export async function writeSystemLog(
  category: SystemLogCategory,
  level: SystemLogLevel,
  message: string,
  detail?: Prisma.InputJsonValue,
) {
  await prisma.systemLog.create({
    data: { category, level, message, detail: detail ?? undefined },
  });
}
