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
 * Bucket semantics (mutually exclusive):
 *   - `noAlias`              — model has no alias_model_links rows
 *   - `disabledAliasOnly`    — has links but no linked alias is enabled
 *   - `enabledAliasPriced`   — at least one enabled alias has non-empty sellPrice
 *   - `enabledAliasUnpriced` — at least one enabled alias, none have sellPrice
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
        AND ma."sellPrice" IS NOT NULL
        AND ma."sellPrice"::text != '{}'
    )
      THEN 'enabledAliasPriced'
    ELSE 'enabledAliasUnpriced'
  END
`;
