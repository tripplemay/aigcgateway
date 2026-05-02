/**
 * BL-SYNC-INTEGRITY-PHASE2 — alias_status SQL CASE shared between
 * `api/admin/sync-status` (F-SI2-02 zeroPriceChannelsByAliasStatus 4-bucket
 * GROUP BY) and `scripts/maintenance/scan-zero-price-channels.ts` (F-SI2-03
 * three-dim summary). Single source of truth — both queries must classify
 * channels identically or PHASE2 reconciliation breaks.
 *
 * Caller contract: query MUST alias the models table as `m` so `m.id`
 * resolves correctly.
 *
 * "Usable sellPrice" semantics — aligned with /v1/models route.ts:80
 * `if (sellPrice && Object.keys(sellPrice).length > 0)`. SQL counterpart:
 *   `sellPrice IS NOT NULL                       -- not SQL NULL`
 *   `AND jsonb_typeof("sellPrice"::jsonb) = 'object'` (excludes JSON null)
 *   `AND "sellPrice"::jsonb <> '{}'::jsonb`      -- non-empty
 *
 * Why both null guards: Prisma persists `sellPrice: null` as JSON null
 * (text 'null'), not SQL NULL — Codex evaluator caught this on
 * BL-SYNC-INTEGRITY-PHASE2 verifying-2026-05-02.
 *
 * Bucket semantics (mutually exclusive):
 *   - `noAlias`              — model has no alias_model_links rows
 *   - `disabledAliasOnly`    — has links but no linked alias is enabled
 *   - `enabledAliasPriced`   — at least one enabled alias has usable sellPrice
 *   - `enabledAliasUnpriced` — has enabled alias, none have usable sellPrice
 */

export type AliasStatusBucket =
  | "noAlias"
  | "disabledAliasOnly"
  | "enabledAliasPriced"
  | "enabledAliasUnpriced";

export const ALIAS_STATUS_BUCKETS: readonly AliasStatusBucket[] = [
  "enabledAliasPriced",
  "enabledAliasUnpriced",
  "disabledAliasOnly",
  "noAlias",
] as const;

/**
 * Raw SQL boolean expression — true when alias `ma` row has a usable
 * sellPrice (non-empty JSON object). Caller must alias the
 * model_aliases table as `ma`. Inverse of unpriced-alias predicate;
 * keep both call sites in sync via this constant.
 */
export const SQL_ALIAS_HAS_USABLE_SELL_PRICE = `(
  ma."sellPrice" IS NOT NULL
  AND jsonb_typeof(ma."sellPrice"::jsonb) = 'object'
  AND ma."sellPrice"::jsonb <> '{}'::jsonb
)`;

/**
 * Raw SQL boolean expression — true when alias row (referenced as
 * `model_aliases` columns directly, no table alias) has NO usable
 * sellPrice. Used in unpricedActiveAliases COUNT(*).
 */
export const SQL_ALIAS_HAS_NO_USABLE_SELL_PRICE_BARE = `(
  "sellPrice" IS NULL
  OR jsonb_typeof("sellPrice"::jsonb) <> 'object'
  OR "sellPrice"::jsonb = '{}'::jsonb
)`;

/**
 * Raw SQL fragment producing the `alias_status` bucket for the model
 * referenced by `m.id`. Returns 'noAlias' / 'disabledAliasOnly' /
 * 'enabledAliasPriced' / 'enabledAliasUnpriced'.
 *
 * For prisma.$queryRaw (tagged template) interpolate via `Prisma.raw(...)`.
 * For prisma.$queryRawUnsafe inline as plain string.
 */
export const SQL_ALIAS_STATUS_CASE = `
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM alias_model_links aml WHERE aml."modelId" = m.id
    )
      THEN 'noAlias'
    WHEN NOT EXISTS (
      SELECT 1 FROM alias_model_links aml
      JOIN model_aliases ma ON ma.id = aml."aliasId"
      WHERE aml."modelId" = m.id AND ma.enabled = true
    )
      THEN 'disabledAliasOnly'
    WHEN EXISTS (
      SELECT 1 FROM alias_model_links aml
      JOIN model_aliases ma ON ma.id = aml."aliasId"
      WHERE aml."modelId" = m.id
        AND ma.enabled = true
        AND ${SQL_ALIAS_HAS_USABLE_SELL_PRICE}
    )
      THEN 'enabledAliasPriced'
    ELSE 'enabledAliasUnpriced'
  END
`;
