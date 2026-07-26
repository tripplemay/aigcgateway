/**
 * Fix deepseek-v4 alias classification in production.
 *
 * Changes:
 *  1. Rename existing `deepseek-v4` alias → `deepseek-v4-flash`, fill capabilities/sellPrice, enable.
 *  2. Unlink the two pro-tier models from the renamed flash alias.
 *  3. Create new `deepseek-v4-pro` alias, enabled, link to the two pro models.
 *  4. Delete erroneous Qwen-provider channels for both v4 models.
 *  5. Enable both direct v4 models (`deepseek-v4-flash`, `deepseek-v4-pro`).
 *
 * Run on production: `npx tsx scripts/fix-deepseek-v4-prod.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEXT_CAPS = {
  search: false,
  vision: false,
  json_mode: true,
  reasoning: false,
  streaming: true,
  system_prompt: true,
  function_calling: true,
};

const FLASH_PRICE = { unit: "token", inputPer1M: 0.14, outputPer1M: 0.28 };
const PRO_PRICE = { unit: "token", inputPer1M: 1.74, outputPer1M: 3.48 };

const FLASH_MODELS = ["deepseek-v4-flash", "deepseek/deepseek-v4-flash"];
const PRO_MODELS = ["deepseek-v4-pro", "deepseek/deepseek-v4-pro"];

async function main() {
  console.log("=== BEFORE ===");
  await dump();

  await prisma.$transaction(async (tx) => {
    // Resolve model IDs
    const allModels = await tx.model.findMany({
      where: { name: { in: [...FLASH_MODELS, ...PRO_MODELS] } },
      select: { id: true, name: true },
    });
    const idByName = Object.fromEntries(allModels.map((m) => [m.name, m.id]));
    const flashIds = FLASH_MODELS.map((n) => idByName[n]).filter(Boolean);
    const proIds = PRO_MODELS.map((n) => idByName[n]).filter(Boolean);
    if (flashIds.length !== 2 || proIds.length !== 2) {
      throw new Error(`Missing models. flash=${JSON.stringify(flashIds)} pro=${JSON.stringify(proIds)}`);
    }

    // Resolve qwen provider id
    const qwen = await tx.provider.findUnique({ where: { name: "qwen" } });
    if (!qwen) throw new Error("provider 'qwen' not found");

    // Step 1: Rename deepseek-v4 → deepseek-v4-flash, set caps/price/enable
    const renamed = await tx.modelAlias.update({
      where: { alias: "deepseek-v4" },
      data: {
        alias: "deepseek-v4-flash",
        capabilities: TEXT_CAPS,
        sellPrice: FLASH_PRICE,
        enabled: true,
      },
    });
    console.log(`[1] Renamed alias 'deepseek-v4' → 'deepseek-v4-flash' (id=${renamed.id})`);

    // Step 2: Unlink pro models from flash alias
    const unlinked = await tx.aliasModelLink.deleteMany({
      where: { aliasId: renamed.id, modelId: { in: proIds } },
    });
    console.log(`[2] Unlinked ${unlinked.count} pro models from deepseek-v4-flash alias`);

    // Step 3: Create deepseek-v4-pro alias + links
    const proAlias = await tx.modelAlias.create({
      data: {
        alias: "deepseek-v4-pro",
        brand: "DeepSeek",
        modality: "TEXT",
        enabled: true,
        deprecated: false,
        contextWindow: 1_000_000,
        maxTokens: 384_000,
        capabilities: TEXT_CAPS,
        sellPrice: PRO_PRICE,
        models: { create: proIds.map((modelId) => ({ modelId })) },
      },
    });
    console.log(`[3] Created alias 'deepseek-v4-pro' (id=${proAlias.id}) with ${proIds.length} model links`);

    // Step 4: Delete qwen channels for both v4 models (direct-tier only)
    const directIds = [idByName["deepseek-v4-flash"], idByName["deepseek-v4-pro"]];
    const deletedChannels = await tx.channel.deleteMany({
      where: { providerId: qwen.id, modelId: { in: directIds } },
    });
    console.log(`[4] Deleted ${deletedChannels.count} erroneous qwen channels`);

    // Step 5: Enable direct v4 models
    const enabledModels = await tx.model.updateMany({
      where: { id: { in: directIds } },
      data: { enabled: true },
    });
    console.log(`[5] Enabled ${enabledModels.count} direct v4 models`);
  });

  console.log("\n=== AFTER ===");
  await dump();
}

async function dump() {
  const aliases = await prisma.modelAlias.findMany({
    where: { alias: { in: ["deepseek-v4", "deepseek-v4-flash", "deepseek-v4-pro"] } },
    include: { models: { include: { model: true } } },
    orderBy: { alias: "asc" },
  });
  for (const a of aliases) {
    console.log(JSON.stringify({
      alias: a.alias,
      brand: a.brand,
      modality: a.modality,
      enabled: a.enabled,
      capabilities: a.capabilities,
      sellPrice: a.sellPrice,
      links: a.models.map((l) => `${l.model.name} (enabled=${l.model.enabled})`),
    }, null, 2));
  }

  const channels = await prisma.channel.findMany({
    where: { model: { name: { in: [...FLASH_MODELS, ...PRO_MODELS] } } },
    include: { model: { select: { name: true } }, provider: { select: { name: true } } },
    orderBy: [{ model: { name: "asc" } }, { provider: { name: "asc" } }],
  });
  console.log("\n-- channels --");
  for (const c of channels) {
    console.log(`  ${c.model.name} via ${c.provider.name} (status=${c.status})  cost=${JSON.stringify(c.costPrice)}`);
  }
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
