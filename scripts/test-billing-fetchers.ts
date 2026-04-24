/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — manual fetcher verification script.
 *
 * Usage:
 *   npx tsx scripts/test-billing-fetchers.ts 2026-04-22
 *   npx tsx scripts/test-billing-fetchers.ts volcengine 2026-04-22
 *
 * Requires DB to have provider rows for volcengine / openrouter /
 * chatanywhere with authConfig containing:
 *   - volcengine: apiKey + billingAccessKeyId + billingSecretAccessKey
 *   - openrouter: apiKey + provisioningKey (is_management_key=true)
 *   - chatanywhere: apiKey
 *
 * Outputs BillRecord arrays (non-empty = success). Used by Evaluator for
 * F-BAX-07 acceptance items 13/14/15.
 */
import { prisma } from "../src/lib/prisma";
import { VolcengineBillFetcher } from "../src/lib/billing-audit/fetchers/volcengine";
import { OpenRouterBillFetcher } from "../src/lib/billing-audit/fetchers/openrouter";
import { ChatanyWhereBillFetcher } from "../src/lib/billing-audit/fetchers/chatanywhere";
import type {
  BillingAuthConfig,
  TierOneBillFetcher,
} from "../src/lib/billing-audit/fetchers/tier1-fetcher";

const FETCHERS: Record<string, (auth: BillingAuthConfig) => TierOneBillFetcher> = {
  volcengine: (auth) => new VolcengineBillFetcher(auth),
  openrouter: (auth) => new OpenRouterBillFetcher(auth),
  chatanywhere: (auth) => new ChatanyWhereBillFetcher(auth),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let providerNameFilter: string | null = null;
  let dateArg: string | null = null;

  if (args.length === 1) {
    dateArg = args[0];
  } else if (args.length === 2) {
    providerNameFilter = args[0];
    dateArg = args[1];
  } else {
    console.error(
      "usage: npx tsx scripts/test-billing-fetchers.ts [<provider>] <YYYY-MM-DD>",
    );
    process.exit(2);
  }

  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("invalid date, expected YYYY-MM-DD");
    process.exit(2);
  }

  const date = new Date(`${dateArg}T00:00:00Z`);
  const names = providerNameFilter ? [providerNameFilter] : Object.keys(FETCHERS);

  for (const name of names) {
    if (!FETCHERS[name]) {
      console.warn(`[skip] unknown provider fetcher: ${name}`);
      continue;
    }
    const provider = await prisma.provider.findUnique({ where: { name } });
    if (!provider) {
      console.warn(`[skip] provider '${name}' not in DB`);
      continue;
    }
    const auth = (provider.authConfig ?? {}) as BillingAuthConfig;
    const fetcher = FETCHERS[name](auth);
    console.log(`\n========== ${name} / ${dateArg} ==========`);
    try {
      const records = await fetcher.fetchDailyBill(date);
      console.log(`records=${records.length}`);
      for (const r of records) {
        console.log(
          `  ${r.date.toISOString().slice(0, 10)} ${r.modelName} requests=${r.requests ?? "-"} amount=${r.amount} ${r.currency}`,
        );
      }
    } catch (err) {
      console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
