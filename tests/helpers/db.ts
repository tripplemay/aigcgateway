/**
 * Testcontainers PostgreSQL helper for aigcgateway integration tests.
 *
 * Lifecycle:
 *   - `setupTestDb()`     — boot postgres:16-alpine, run `prisma migrate
 *                           deploy` to apply all 64 migrations + native
 *                           SQL functions, return a Prisma client bound
 *                           to the container's connection string.
 *                           Within a single Vitest worker, the container
 *                           is shared (idempotent re-entry).
 *   - `teardownTestDb()`  — disconnect the client and stop the container.
 *
 * Two-call pattern: tests call `setupTestDb()` in `beforeAll` and
 * `teardownTestDb()` in `afterAll`. Each test should clean its own
 * fixtures (truncate users / transactions / etc) inside `beforeEach`
 * if the test logic depends on a known DB state — see
 * `tests/integration/deduct-balance-atomic.test.ts` for the canonical
 * pattern.
 */
import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

type SharedDb = {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  url: string;
};

const POSTGRES_IMAGE = "postgres:16-alpine";
const DB_NAME = "aigc_gateway_test";

let shared: SharedDb | null = null;

export async function setupTestDb(): Promise<SharedDb> {
  if (shared) return shared;

  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DB_NAME)
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = `postgresql://postgres:postgres@${host}:${port}/${DB_NAME}?schema=public`;

  // Run prisma migrate deploy with the container URL as DATABASE_URL.
  // execSync is fine here — migrations boot once per worker.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$connect();

  shared = { container, prisma, url };
  return shared;
}

export async function teardownTestDb(): Promise<void> {
  if (!shared) return;
  try {
    await shared.prisma.$disconnect();
  } finally {
    await shared.container.stop();
    shared = null;
  }
}

/**
 * Truncate all business tables, restarting identity sequences. Use
 * inside `beforeEach` when a test needs a known empty state.
 *
 * Order doesn't matter under CASCADE, but the explicit list documents
 * which tables the test surface touches.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE
       "transactions",
       "call_logs",
       "api_keys",
       "projects",
       "users"
     RESTART IDENTITY CASCADE`,
  );
}
