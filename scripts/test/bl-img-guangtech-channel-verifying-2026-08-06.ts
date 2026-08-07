import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const aliases = ["gpt-image-1", "gpt-image-1.5", "gpt-image-2"];
const modelNames = aliases.map((alias) => `guangtech/${alias}`);

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function runCli(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "./node_modules/.bin/tsx",
      ["scripts/add-guangtech-image-channels.ts", ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, output }));
  });
}

async function removeFixture(): Promise<void> {
  const fixtureAliases = await prisma.modelAlias.findMany({
    where: { alias: { in: aliases } },
    select: { id: true },
  });
  const fixtureModels = await prisma.model.findMany({
    where: { name: { in: modelNames } },
    select: { id: true },
  });
  const provider = await prisma.provider.findUnique({
    where: { name: "guangtech" },
    select: { id: true },
  });

  await prisma.aliasModelLink.deleteMany({
    where: {
      OR: [
        { aliasId: { in: fixtureAliases.map((row) => row.id) } },
        { modelId: { in: fixtureModels.map((row) => row.id) } },
      ],
    },
  });
  if (provider) {
    await prisma.channel.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerConfig.deleteMany({ where: { providerId: provider.id } });
  }
  await prisma.modelAlias.deleteMany({ where: { alias: { in: aliases } } });
  await prisma.model.deleteMany({ where: { name: { in: modelNames } } });
  await prisma.provider.deleteMany({ where: { name: "guangtech" } });
}

async function seedFixture(baseUrl: string): Promise<void> {
  const provider = await prisma.provider.create({
    data: {
      name: "guangtech",
      displayName: "Guangtech evaluator fixture",
      baseUrl,
      authConfig: { apiKey: "test-upstream-key" },
      status: "ACTIVE",
      adapterType: "openai-compat",
    },
  });
  await prisma.providerConfig.create({
    data: {
      providerId: provider.id,
      currency: "USD",
      imageViaChat: false,
      imageEndpoint: "/images/generations",
    },
  });
  await prisma.model.createMany({
    data: modelNames.map((name) => ({
      name,
      displayName: name,
      modality: "IMAGE",
      enabled: false,
      supportedSizes: ["512x512"],
    })),
  });
}

async function counts(): Promise<{ channels: number; aliases: number; links: number }> {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { name: "guangtech" } });
  const [channels, aliasCount, links] = await Promise.all([
    prisma.channel.count({ where: { providerId: provider.id } }),
    prisma.modelAlias.count({ where: { alias: { in: aliases } } }),
    prisma.aliasModelLink.count({ where: { model: { name: { in: modelNames } } } }),
  ]);
  return { channels, aliases: aliasCount, links };
}

async function main(): Promise<void> {
  const upstream = createServer((_request, response) => {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "forced evaluator probe failure" } }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("failed to bind upstream fixture");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await removeFixture();
    await seedFixture(baseUrl);

    const beforeDryRun = await counts();
    const dryRun = await runCli([]);
    const afterDryRun = await counts();
    check(
      "default dry-run is read-only",
      dryRun.code === 0 && JSON.stringify(beforeDryRun) === JSON.stringify(afterDryRun),
      `before=${JSON.stringify(beforeDryRun)} after=${JSON.stringify(afterDryRun)}`,
    );

    const firstApply = await runCli(["--apply"]);
    const afterFirstApply = await counts();
    check(
      "first apply provisions one row per target",
      firstApply.code === 0 &&
        afterFirstApply.channels === 3 &&
        afterFirstApply.aliases === 3 &&
        afterFirstApply.links === 3,
      JSON.stringify(afterFirstApply),
    );

    const secondApply = await runCli(["--apply"]);
    const afterSecondApply = await counts();
    check(
      "second apply does not create duplicates",
      secondApply.code === 0 &&
        JSON.stringify(afterSecondApply) === JSON.stringify(afterFirstApply),
      `first=${JSON.stringify(afterFirstApply)} second=${JSON.stringify(afterSecondApply)}`,
    );

    const targetModel = await prisma.model.findUniqueOrThrow({
      where: { name: "guangtech/gpt-image-2" },
    });
    const provider = await prisma.provider.findUniqueOrThrow({ where: { name: "guangtech" } });
    await prisma.model.update({
      where: { id: targetModel.id },
      data: { supportedSizes: ["512x512"] },
    });
    await prisma.channel.update({
      where: { providerId_modelId: { providerId: provider.id, modelId: targetModel.id } },
      data: { priority: 3 },
    });
    await runCli(["--apply", "--only=gpt-image-2"]);
    const convergedModel = await prisma.model.findUniqueOrThrow({ where: { id: targetModel.id } });
    const convergedChannel = await prisma.channel.findUniqueOrThrow({
      where: { providerId_modelId: { providerId: provider.id, modelId: targetModel.id } },
    });
    check(
      "apply converges supportedSizes to null",
      convergedModel.supportedSizes === null,
      `supportedSizes=${JSON.stringify(convergedModel.supportedSizes)}`,
    );
    check(
      "apply converges channel priority to 10",
      convergedChannel.priority === 10,
      `priority=${convergedChannel.priority}`,
    );

    await prisma.aliasModelLink.deleteMany({ where: { modelId: targetModel.id } });
    await prisma.modelAlias.deleteMany({ where: { alias: "gpt-image-2" } });
    await prisma.channel.deleteMany({
      where: { providerId: provider.id, modelId: targetModel.id },
    });
    await prisma.model.update({ where: { id: targetModel.id }, data: { enabled: false } });

    const failedProbeApply = await runCli(["--probe", "--apply", "--only=gpt-image-2"]);
    const channelAfterFailedProbe = await prisma.channel.count({
      where: { providerId: provider.id, modelId: targetModel.id },
    });
    check(
      "failed probe blocks apply for that model",
      failedProbeApply.output.includes("[FAIL] gpt-image-2") && channelAfterFailedProbe === 0,
      `exit=${failedProbeApply.code} channelCount=${channelAfterFailedProbe}; output=${failedProbeApply.output
        .trim()
        .replace(/\s+/g, " ")}`,
    );
  } finally {
    await removeFixture();
    await prisma.$disconnect();
    upstream.close();
  }

  const failed = checks.filter((item) => !item.pass);
  console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
