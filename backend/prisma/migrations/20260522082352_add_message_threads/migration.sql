-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "broadcastToChannel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "threadLastReplyAt" TIMESTAMP(3),
ADD COLUMN     "threadReplyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "threadRootId" TEXT;

-- CreateIndex
CREATE INDEX "Message_chatId_threadRootId_createdAt_idx" ON "Message"("chatId", "threadRootId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
