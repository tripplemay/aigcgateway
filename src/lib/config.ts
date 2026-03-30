import { prisma } from "./prisma";

/**
 * Get a system config value by key.
 * Returns the value string, or the provided default if not found.
 */
export async function getConfig(
  key: string,
  defaultValue?: string
): Promise<string | undefined> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  return row?.value ?? defaultValue;
}

/**
 * Get a system config value as a number.
 */
export async function getConfigNumber(
  key: string,
  defaultValue: number
): Promise<number> {
  const val = await getConfig(key);
  if (val === undefined) return defaultValue;
  const num = parseFloat(val);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Set a system config value. Creates if not exists, updates if exists.
 */
export async function setConfig(
  key: string,
  value: string,
  description?: string
): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value, ...(description !== undefined ? { description } : {}) },
    create: { key, value, description },
  });
}
