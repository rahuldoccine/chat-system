import { Prisma } from "@prisma/client";

import { getPrisma } from "./prisma.js";
import { messageWithSenderInclude } from "./message-includes.js";

export type SystemMessagePersistInput = {
  chatId: string;
  senderId: string;
  clientMessageId: string;
  ciphertext: string;
  contentMeta: Record<string, unknown>;
};

export async function findSystemMessageByClientId(chatId: string, clientMessageId: string) {
  const prisma = getPrisma();
  return prisma.message.findUnique({
    where: { chatId_clientMessageId: { chatId, clientMessageId } },
    include: messageWithSenderInclude,
  });
}

export async function createSystemMessageWithReceipts(input: SystemMessagePersistInput) {
  const prisma = getPrisma();
  const members = await prisma.chatMember.findMany({
    where: { chatId: input.chatId, leftAt: null },
  });

  return prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        chatId: input.chatId,
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
        kind: "SYSTEM",
        ciphertext: input.ciphertext,
        contentMeta: input.contentMeta as Prisma.InputJsonValue,
      },
      include: messageWithSenderInclude,
    });
    const receipts = members
      .filter((m) => m.userId !== input.senderId)
      .map((m) => ({ messageId: msg.id, userId: m.userId }));
    if (receipts.length) {
      await tx.receipt.createMany({ data: receipts });
    }
    await tx.chat.update({
      where: { id: input.chatId },
      data: { lastMessageAt: msg.createdAt, updatedAt: new Date() },
    });
    return msg;
  });
}
