/**
 * Setup script to create a zero-balance test fixture for TC-04-6.
 *
 * 用法：npx tsx scripts/setup-zero-balance-test.ts
 *
 * 输出：打印项目 ID 和 API Key，供测试使用。
 *
 * BL-SEC-POLISH F-SP-03 #13: fixed legacy schema drift:
 *   - `balance` lives on User (not Project). We zero the owning user's
 *     balance so the project's API key fails its billing guard.
 *   - ApiKey is scoped by `userId` (not `projectId`). We attach the key
 *     to the fixture user.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `pk_${randomBytes(16).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function main() {
  console.log("Setting up zero-balance test fixture...\n");

  // Get or create a test user with a real bcrypt hash (H-44) and balance=0.
  let user = await prisma.user.findFirst({
    where: { email: "test-zero-balance@example.com" },
  });

  if (!user) {
    const randomPassword = randomBytes(16).toString("hex");
    const passwordHash = bcrypt.hashSync(randomPassword, 10);
    user = await prisma.user.create({
      data: {
        email: "test-zero-balance@example.com",
        name: "Zero Balance Test User",
        passwordHash,
        balance: new Prisma.Decimal(0),
      },
    });
    console.log(`Created test user: ${user.email}`);
  } else {
    // Ensure balance is 0 on the existing fixture — earlier tests may have
    // topped it up via transactions.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { balance: new Prisma.Decimal(0) },
    });
    console.log(`Using existing user (balance reset to 0): ${user.email}`);
  }

  // Get or create the project (no balance column — Project is just a
  // logical container; the billing guard reads User.balance).
  const projectName = "Zero Balance Test Project";
  let project = await prisma.project.findFirst({
    where: { userId: user.id, name: projectName },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        userId: user.id,
        name: projectName,
        description: "Fixture project for TC-04-6 insufficient-balance tests",
      },
    });
    console.log(`Created fixture project: ${project.id}`);
  } else {
    console.log(`Using existing fixture project: ${project.id}`);
  }

  // Get or create the API key — owned by the user, not the project.
  const apiKeyValue = generateApiKey();
  const keyHash = hashApiKey(apiKeyValue);
  const keyPrefix = apiKeyValue.slice(0, 20);

  let apiKey = await prisma.apiKey.findFirst({ where: { userId: user.id } });
  let printedKey = apiKeyValue;

  if (!apiKey) {
    apiKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        keyHash,
        keyPrefix,
        name: "Zero Balance Test Key",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 year
      },
    });
    console.log(`Created API key: ${apiKeyValue}`);
  } else {
    console.log("Using existing API key (keyHash preserved; raw value not retrievable)");
    printedKey = "<existing — re-run after revoking to mint a new raw value>";
  }

  console.log("\n" + "=".repeat(60));
  console.log("Setup completed!");
  console.log("=".repeat(60));
  console.log(`User ID: ${user.id}`);
  console.log(`User balance: ${user.balance.toString()}`);
  console.log(`Project ID: ${project.id}`);
  console.log(`API Key: ${printedKey}`);
  console.log("\nUsage for error tests:");
  console.log(`ZERO_BALANCE_API_KEY=${printedKey} npm run test:mcp:errors`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
