/**
 * Setup script to create a zero-balance test project for TC-04-6
 *
 * 用法：npx tsx scripts/setup-zero-balance-test.ts
 *
 * 输出：会打印创建的项目 ID 和 API Key，供测试使用
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `pk_${randomBytes(16).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function main() {
  console.log("Setting up zero-balance test project...\n");

  // Get or create a test user
  let user = await prisma.user.findFirst({
    where: {
      email: "test-zero-balance@example.com",
    },
  });

  if (!user) {
    // BL-SEC-POLISH H-44: generate a valid bcrypt hash of a random password
    // instead of a literal "dummy" string. Some auth paths (bcrypt.getRounds)
    // throw on malformed hashes; a real $2a$ hash keeps login etc. from
    // crashing even though this fixture user is only used for API key auth.
    const randomPassword = randomBytes(16).toString("hex");
    const passwordHash = bcrypt.hashSync(randomPassword, 10);
    user = await prisma.user.create({
      data: {
        email: "test-zero-balance@example.com",
        name: "Zero Balance Test User",
        passwordHash,
      },
    });
    console.log(`Created test user: ${user.email}`);
  } else {
    console.log(`Using existing user: ${user.email}`);
  }

  // Create or update zero-balance project
  const projectName = "Zero Balance Test Project";
  let project = await prisma.project.findFirst({
    where: {
      userId: user.id,
      name: projectName,
    },
  });

  if (project) {
    // Update balance to 0
    project = await prisma.project.update({
      where: { id: project.id },
      data: { balance: 0 },
    });
    console.log(`Updated existing project: ${project.id}`);
  } else {
    project = await prisma.project.create({
      data: {
        userId: user.id,
        name: projectName,
        description: "Test project with zero balance for TC-04-6",
        balance: 0,
      },
    });
    console.log(`Created zero-balance project: ${project.id}`);
  }

  // Create or update API key
  const apiKeyValue = generateApiKey();
  const keyHash = hashApiKey(apiKeyValue);
  const keyPrefix = apiKeyValue.slice(0, 20); // First 20 chars

  let apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
    },
  });

  if (!apiKey) {
    apiKey = await prisma.apiKey.create({
      data: {
        projectId: project.id,
        keyHash,
        keyPrefix,
        name: "Zero Balance Test Key",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      },
    });
    console.log(`Created API key: ${apiKeyValue}`);
  } else {
    console.log(`Using existing API key (hash already exists)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Setup completed!");
  console.log("=".repeat(60));
  console.log(`Project ID: ${project.id}`);
  console.log(`Project Balance: ${project.balance}`);
  console.log(`API Key: ${apiKeyValue}`);
  console.log("\nUsage for error tests:");
  console.log(`ZERO_BALANCE_API_KEY=${apiKeyValue} npm run test:mcp:errors`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
