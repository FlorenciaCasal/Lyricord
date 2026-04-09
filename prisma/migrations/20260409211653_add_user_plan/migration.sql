-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ALTER COLUMN "updatedAt" DROP DEFAULT;
