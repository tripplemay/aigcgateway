-- BILLING-REFACTOR: Channel.sellPrice optional + remove sellPriceLocked
-- sellPrice retained as historical cost reference, but billing now uses ModelAlias.sellPrice

-- Make sellPrice optional (allow NULL)
ALTER TABLE "channels" ALTER COLUMN "sellPrice" DROP NOT NULL;

-- Remove sellPriceLocked (no longer needed — pricing managed via alias.sellPrice)
ALTER TABLE "channels" DROP COLUMN IF EXISTS "sellPriceLocked";
