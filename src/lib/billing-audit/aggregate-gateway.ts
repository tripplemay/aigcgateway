/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-02 — gateway-side cost aggregation.
 *
 * 对账时需要"同一 provider 在 reportDate 当天的 gateway-计入成本总和"。
 * 用 P2 新加的 idx_call_logs_channel_source_date / idx_call_logs_created_at
 * 索引加速。
 *
 * 参数：
 *   - providerId：通过 channel.providerId 过滤
 *   - modelName：tier 1 传 upstream 返回的 model 名（与 channel.realModelId
 *     比较，因为 call_logs.modelName 存的是 alias，不是上游真实 model）；
 *     tier 2 传 null 表示该 provider 全部聚合。
 *   - reportDate：UTC 当天 00:00 ~ +1 day。
 *
 * 返回 Number（USD 等价值；call_logs.costPrice 已统一 USD）。
 */
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function aggregateGatewayCallLogs(
  providerId: string,
  modelName: string | null,
  reportDate: Date,
): Promise<number> {
  const dayStart = new Date(
    Date.UTC(
      reportDate.getUTCFullYear(),
      reportDate.getUTCMonth(),
      reportDate.getUTCDate(),
    ),
  );
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  // 用 channel join 过滤；modelName 时再 join model 比对 realModelId
  const rows = await prisma.callLog.findMany({
    where: {
      channel: {
        providerId,
        ...(modelName ? { realModelId: modelName } : {}),
      },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: { costPrice: true },
  });

  let sum = 0;
  for (const r of rows) {
    if (r.costPrice !== null && r.costPrice !== undefined) {
      sum += Number(r.costPrice);
    }
  }
  return sum;
}
