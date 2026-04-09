-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."Song" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- Backfill existing songs into a legacy owner so the migration is safe on non-empty data.
INSERT INTO "public"."User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
SELECT
    'legacy-user',
    'legacy@cancionero.local',
    '$2b$10$7Q4vQ0kYf8m0nP9A1rR0A.nP4xQYk3lB6v4Qm2qD7p8sWz1J3cE6G',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."User"
    WHERE "email" = 'legacy@cancionero.local'
);

UPDATE "public"."Song"
SET "userId" = 'legacy-user'
WHERE "userId" IS NULL;

ALTER TABLE "public"."Song"
ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Song_userId_updatedAt_idx" ON "public"."Song"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "public"."Song"
ADD CONSTRAINT "Song_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
