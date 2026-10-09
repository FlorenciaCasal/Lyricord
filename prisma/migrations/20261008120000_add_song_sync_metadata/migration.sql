-- Add nullable sync metadata for mobile local-first backup/sync.
-- Existing web/backend songs remain valid because clientId and deletedAt are nullable.

ALTER TABLE "Song" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Song" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Song_userId_clientId_key" ON "Song"("userId", "clientId");
CREATE INDEX "Song_userId_deletedAt_updatedAt_idx" ON "Song"("userId", "deletedAt", "updatedAt");
