-- AlterEnum
ALTER TYPE "ChatE2eeMode" ADD VALUE IF NOT EXISTS 'GROUP_V1';

-- CreateTable
CREATE TABLE IF NOT EXISTS "GroupSenderKey" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "distribution" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSenderKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupSenderKey_chatId_senderId_epoch_key" ON "GroupSenderKey"("chatId", "senderId", "epoch");
CREATE INDEX IF NOT EXISTS "GroupSenderKey_chatId_senderId_idx" ON "GroupSenderKey"("chatId", "senderId");
