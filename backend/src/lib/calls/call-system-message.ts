import { Prisma, type CallKind, type CallStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import {
  formatCallCiphertext,
  mapTerminalStatus,
  type CallContentStatus,
} from "./call-helpers.js";
import { publicMessage } from "../../modules/chats/chats.service.js";

const messageWithSenderInclude = {
  sender: {
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  },
  replyTo: {
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  },
} as const;

export async function createCallSystemMessage(input: {
  chatId: string;
  callId: string;
  initiatorId: string;
  peerId: string;
  kind: CallKind;
  status: CallStatus;
  durationSec: number;
  endReason?: string;
}): Promise<ReturnType<typeof publicMessage> | null> {
  if (!input.chatId) return null;
  const prisma = getPrisma();
  const contentStatus: CallContentStatus = mapTerminalStatus(input.status, input.endReason);
  const ciphertext = formatCallCiphertext(input.kind, contentStatus, input.durationSec);
  const contentMeta = {
    call: {
      callId: input.callId,
      kind: input.kind,
      status: contentStatus,
      durationSec: input.durationSec,
      initiatorId: input.initiatorId,
      peerId: input.peerId,
    },
  };

  const clientMessageId = `call-${input.callId}`;

  const existing = await prisma.message.findUnique({
    where: { chatId_clientMessageId: { chatId: input.chatId, clientMessageId } },
    include: messageWithSenderInclude,
  });
  if (existing) {
    return publicMessage(existing, [], "sent", null);
  }

  const members = await prisma.chatMember.findMany({
    where: { chatId: input.chatId, leftAt: null },
  });

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        chatId: input.chatId,
        senderId: input.initiatorId,
        clientMessageId,
        kind: "SYSTEM",
        ciphertext,
        contentMeta: contentMeta as Prisma.InputJsonValue,
      },
      include: messageWithSenderInclude,
    });
    const receipts = members
      .filter((m) => m.userId !== input.initiatorId)
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

  return publicMessage(message, [], "sent", null);
}
