-- AlterTable: ProviderConfig add staticModels
ALTER TABLE "provider_configs" ADD COLUMN "staticModels" JSONB;

-- AlterTable: Channel add sellPriceLocked
ALTER TABLE "channels" ADD COLUMN "sellPriceLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: SystemConfig
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");
