CREATE TABLE "RevenueCatEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "environment" TEXT,
    "originalTransactionId" TEXT,
    "lastEventId" TEXT,
    "lastEventType" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueCatEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueCatEntitlement_userId_entitlementId_key" ON "RevenueCatEntitlement"("userId", "entitlementId");
CREATE INDEX "RevenueCatEntitlement_appUserId_idx" ON "RevenueCatEntitlement"("appUserId");
CREATE INDEX "RevenueCatEntitlement_originalTransactionId_idx" ON "RevenueCatEntitlement"("originalTransactionId");
CREATE INDEX "RevenueCatEntitlement_status_expiresAt_idx" ON "RevenueCatEntitlement"("status", "expiresAt");

ALTER TABLE "RevenueCatEntitlement" ADD CONSTRAINT "RevenueCatEntitlement_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
