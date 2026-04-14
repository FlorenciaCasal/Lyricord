-- CreateTable
CREATE TABLE "public"."RateLimitEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitEvent_type_key_createdAt_idx" ON "public"."RateLimitEvent"("type", "key", "createdAt");
