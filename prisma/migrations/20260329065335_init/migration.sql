-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ModelModality" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('SUCCESS', 'ERROR', 'TIMEOUT', 'FILTERED');

-- CreateEnum
CREATE TYPE "FinishReason" AS ENUM ('STOP', 'LENGTH', 'CONTENT_FILTER', 'ERROR', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECHARGE', 'DEDUCTION', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "HealthCheckLevel" AS ENUM ('CONNECTIVITY', 'FORMAT', 'QUALITY');

-- CreateEnum
CREATE TYPE "HealthCheckResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'CNY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "balance" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "alertThreshold" DECIMAL(12,6),
    "rateLimit" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'bearer',
    "authConfig" JSONB NOT NULL,
    "rateLimit" JSONB,
    "proxyUrl" TEXT,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "adapterType" TEXT NOT NULL DEFAULT 'openai-compat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "temperatureMin" DOUBLE PRECISION DEFAULT 0,
    "temperatureMax" DOUBLE PRECISION DEFAULT 2,
    "chatEndpoint" TEXT DEFAULT '/chat/completions',
    "imageEndpoint" TEXT DEFAULT '/images/generations',
    "imageViaChat" BOOLEAN NOT NULL DEFAULT false,
    "supportsModelsApi" BOOLEAN NOT NULL DEFAULT false,
    "supportsSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "quirks" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modality" "ModelModality" NOT NULL,
    "maxTokens" INTEGER,
    "contextWindow" INTEGER,
    "capabilities" JSONB,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "realModelId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "costPrice" JSONB NOT NULL,
    "sellPrice" JSONB NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptSnapshot" JSONB NOT NULL,
    "requestParams" JSONB,
    "responseContent" TEXT,
    "finishReason" "FinishReason",
    "status" "CallStatus" NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costPrice" DECIMAL(12,8),
    "sellPrice" DECIMAL(12,8),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "latencyMs" INTEGER,
    "ttftMs" INTEGER,
    "tokensPerSecond" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "templateId" TEXT,
    "templateVariables" JSONB,
    "qualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,6) NOT NULL,
    "balanceAfter" DECIMAL(12,6) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" TEXT,
    "paymentOrderId" TEXT,
    "paymentRaw" JSONB,
    "callLogId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "level" "HealthCheckLevel" NOT NULL,
    "result" "HealthCheckResult" NOT NULL,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_userId_idx" ON "projects"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_projectId_idx" ON "api_keys"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_providerId_key" ON "provider_configs"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "models_name_key" ON "models"("name");

-- CreateIndex
CREATE INDEX "models_modality_idx" ON "models"("modality");

-- CreateIndex
CREATE INDEX "channels_modelId_status_priority_idx" ON "channels"("modelId", "status", "priority");

-- CreateIndex
CREATE INDEX "channels_providerId_idx" ON "channels"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_providerId_modelId_realModelId_key" ON "channels"("providerId", "modelId", "realModelId");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_traceId_key" ON "call_logs"("traceId");

-- CreateIndex
CREATE INDEX "call_logs_traceId_idx" ON "call_logs"("traceId");

-- CreateIndex
CREATE INDEX "call_logs_projectId_createdAt_idx" ON "call_logs"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "call_logs_projectId_modelName_createdAt_idx" ON "call_logs"("projectId", "modelName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "call_logs_projectId_status_idx" ON "call_logs"("projectId", "status");

-- CreateIndex
CREATE INDEX "call_logs_channelId_createdAt_idx" ON "call_logs"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "call_logs_createdAt_idx" ON "call_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "transactions_projectId_createdAt_idx" ON "transactions"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transactions_projectId_type_idx" ON "transactions"("projectId", "type");

-- CreateIndex
CREATE INDEX "transactions_paymentOrderId_idx" ON "transactions"("paymentOrderId");

-- CreateIndex
CREATE INDEX "health_checks_channelId_createdAt_idx" ON "health_checks"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "health_checks_channelId_result_idx" ON "health_checks"("channelId", "result");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
