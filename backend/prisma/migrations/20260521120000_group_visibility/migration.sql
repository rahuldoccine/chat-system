-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "groupVisibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE';
