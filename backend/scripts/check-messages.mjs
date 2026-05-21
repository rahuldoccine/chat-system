import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const msgs = await prisma.message.findMany({
  where: { kind: { not: 'TEXT' } },
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, kind: true, contentMeta: true, ciphertext: true, chatId: true }
});
console.log(JSON.stringify(msgs, null, 2));

const uploads = await prisma.uploadedFile.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, storageKey: true, mimeType: true, chatId: true, userId: true }
});
console.log('\nUploads:');
console.log(JSON.stringify(uploads, null, 2));
await prisma.$disconnect();
