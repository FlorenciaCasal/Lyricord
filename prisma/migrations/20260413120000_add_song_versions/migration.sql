ALTER TABLE "Song" ADD COLUMN "versionName" TEXT DEFAULT 'Principal';
ALTER TABLE "Song" ADD COLUMN "versionGroupId" TEXT;

CREATE INDEX "Song_userId_versionGroupId_idx" ON "Song"("userId", "versionGroupId");
