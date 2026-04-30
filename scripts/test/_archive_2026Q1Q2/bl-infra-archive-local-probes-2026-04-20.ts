import { PrismaClient } from "@prisma/client";
import {
  cleanupHealthChecks,
  cleanupSystemLogs,
} from "../../src/lib/maintenance/archive-cleanup";

type ProbeResult = {
  id: string;
  pass: boolean;
  detail: string;
  data?: Record<string, unknown>;
};

const prisma = new PrismaClient({
  datasourceUrl:
    process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test",
});

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  const now = new Date();
  const results: ProbeResult[] = [];

  const channel = await prisma.channel.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  if (!channel) throw new Error("no channel found for health_checks probe");

  // ---------- #1 cleanupHealthChecks ----------
  const hcRows = await Promise.all([
    prisma.healthCheck.create({
      data: {
        channelId: channel.id,
        level: "API_REACHABILITY",
        result: "PASS",
        createdAt: daysAgo(now, 0),
      },
    }),
    prisma.healthCheck.create({
      data: {
        channelId: channel.id,
        level: "API_REACHABILITY",
        result: "PASS",
        createdAt: daysAgo(now, 20),
      },
    }),
    prisma.healthCheck.create({
      data: {
        channelId: channel.id,
        level: "API_REACHABILITY",
        result: "PASS",
        createdAt: daysAgo(now, 40),
      },
    }),
    prisma.healthCheck.create({
      data: {
        channelId: channel.id,
        level: "API_REACHABILITY",
        result: "PASS",
        createdAt: daysAgo(now, 100),
      },
    }),
  ]);
  const hcIds = hcRows.map((x) => x.id);
  const hcRes = await cleanupHealthChecks(now);
  const hcLeft = await prisma.healthCheck.findMany({ where: { id: { in: hcIds } }, select: { id: true } });
  const hcLeftSet = new Set(hcLeft.map((x) => x.id));
  const hcPass =
    hcRes.deleted >= 2 &&
    hcLeftSet.has(hcRows[0].id) &&
    hcLeftSet.has(hcRows[1].id) &&
    !hcLeftSet.has(hcRows[2].id) &&
    !hcLeftSet.has(hcRows[3].id);
  results.push({
    id: "#1",
    pass: hcPass,
    detail: `deleted=${hcRes.deleted}, remaining=${hcLeft.length}, expected keep 0d/20d remove 40d/100d`,
    data: { deleted: hcRes.deleted, remainingIds: [...hcLeftSet] },
  });

  // ---------- #2 cleanupSystemLogs ----------
  const prefix = `IA_PROBE_${Date.now()}_`;
  const slRows = await Promise.all([
    prisma.systemLog.create({
      data: { category: "SYNC", level: "INFO", message: `${prefix}0d`, createdAt: daysAgo(now, 0) },
    }),
    prisma.systemLog.create({
      data: { category: "SYNC", level: "INFO", message: `${prefix}20d`, createdAt: daysAgo(now, 20) },
    }),
    prisma.systemLog.create({
      data: { category: "SYNC", level: "INFO", message: `${prefix}40d`, createdAt: daysAgo(now, 40) },
    }),
    prisma.systemLog.create({
      data: { category: "SYNC", level: "INFO", message: `${prefix}100d`, createdAt: daysAgo(now, 100) },
    }),
  ]);
  const slIds = slRows.map((x) => x.id);
  const slRes = await cleanupSystemLogs(now);
  const slLeft = await prisma.systemLog.findMany({ where: { id: { in: slIds } }, select: { id: true } });
  const slLeftSet = new Set(slLeft.map((x) => x.id));
  const slPass =
    slRes.deleted >= 1 &&
    slLeftSet.has(slRows[0].id) &&
    slLeftSet.has(slRows[1].id) &&
    slLeftSet.has(slRows[2].id) &&
    !slLeftSet.has(slRows[3].id);
  results.push({
    id: "#2",
    pass: slPass,
    detail: `deleted=${slRes.deleted}, remaining=${slLeft.length}, expected keep 0d/20d/40d remove 100d`,
    data: { deleted: slRes.deleted, remainingIds: [...slLeftSet] },
  });

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
    },
    results,
  };

  console.log(JSON.stringify(output, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
