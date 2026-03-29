-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "recharge_orders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "paymentUrl" TEXT,
    "paymentRaw" JSONB,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_orders_paymentOrderId_key" ON "recharge_orders"("paymentOrderId");
CREATE UNIQUE INDEX "recharge_orders_transactionId_key" ON "recharge_orders"("transactionId");
CREATE INDEX "recharge_orders_projectId_createdAt_idx" ON "recharge_orders"("projectId", "createdAt" DESC);
CREATE INDEX "recharge_orders_paymentOrderId_idx" ON "recharge_orders"("paymentOrderId");
CREATE INDEX "recharge_orders_status_expiresAt_idx" ON "recharge_orders"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
