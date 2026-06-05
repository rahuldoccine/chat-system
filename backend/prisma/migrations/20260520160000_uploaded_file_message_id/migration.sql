-- Link uploads to messages for reliable purge on delete.
ALTER TABLE "UploadedFile" ADD COLUMN "messageId" TEXT;

CREATE INDEX "UploadedFile_messageId_idx" ON "UploadedFile"("messageId");

ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
