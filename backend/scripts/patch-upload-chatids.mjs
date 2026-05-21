/**
 * One-time patch: fix null chatId on uploaded files that were
 * uploaded before chatId was included in the FormData.
 * Matches files to chats by searching message contentMeta.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const nullChatUploads = await prisma.uploadedFile.findMany({
  where: { chatId: null },
  select: { id: true, storageKey: true }
});

console.log(`Found ${nullChatUploads.length} uploads with null chatId`);

for (const upload of nullChatUploads) {
  // Search messages that reference this file by storageKey in contentMeta
  const msg = await prisma.message.findFirst({
    where: {
      OR: [
        { contentMeta: { path: ['filename'], equals: upload.storageKey } },
        { contentMeta: { path: ['url'], string_contains: upload.storageKey } },
      ]
    },
    select: { chatId: true }
  });

  if (msg?.chatId) {
    await prisma.uploadedFile.update({
      where: { id: upload.id },
      data: { chatId: msg.chatId }
    });
    console.log(`✅ Patched ${upload.storageKey} → chatId: ${msg.chatId}`);
  } else {
    console.log(`⚠️  No message found for ${upload.storageKey} - skipped`);
  }
}

await prisma.$disconnect();
console.log('Done.');
