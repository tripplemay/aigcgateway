import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ALL enabled ModelAliases ===");
  const aliases = await prisma.modelAlias.findMany({
    where: { enabled: true },
    include: { models: { include: { model: true } } },
    orderBy: [{ brand: "asc" }, { alias: "asc" }],
  });
  for (const a of aliases) {
    console.log(JSON.stringify({
      alias: a.alias,
      brand: a.brand,
      modality: a.modality,
      deprecated: a.deprecated,
      contextWindow: a.contextWindow,
      description: a.description,
      sellPrice: a.sellPrice,
      linkedModels: a.models.map((l) => `${l.model.name} (enabled=${l.model.enabled})`),
    }, null, 2));
  }

  console.log("\n=== Aliases with 'v4' (any case) anywhere ===");
  const v4Aliases = await prisma.modelAlias.findMany({
    where: {
      OR: [
        { alias: { contains: "v4", mode: "insensitive" } },
        { description: { contains: "v4", mode: "insensitive" } },
      ],
    },
    include: { models: { include: { model: true } } },
  });
  for (const a of v4Aliases) {
    console.log(JSON.stringify({
      alias: a.alias,
      brand: a.brand,
      enabled: a.enabled,
      deprecated: a.deprecated,
      description: a.description,
      linkedModels: a.models.map((l) => l.model.name),
    }, null, 2));
  }

  console.log("\n=== Models with name like deepseek-v3 / deepseek-r1 (raw) ===");
  const exact = await prisma.model.findMany({
    where: {
      OR: [
        { name: { equals: "deepseek-r1" } },
        { name: { equals: "deepseek-v3" } },
        { name: { equals: "deepseek-v4" } },
        { name: { contains: "DeepSeek-V4", mode: "insensitive" } },
      ],
    },
    include: {
      aliasLinks: { include: { alias: true } },
      channels: { include: { provider: true } },
    },
  });
  for (const m of exact) {
    console.log(JSON.stringify({
      name: m.name,
      displayName: m.displayName,
      enabled: m.enabled,
      aliases: m.aliasLinks.map((l) => l.alias.alias),
      channels: m.channels.map((c) => c.provider.name),
    }, null, 2));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
