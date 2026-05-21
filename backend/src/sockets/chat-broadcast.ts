import type { Server } from "socket.io";

import { getPrisma } from "../lib/prisma.js";
import { roomUser } from "./rooms.js";

/** Emit a socket event to every active member of a chat via their personal room. */
export async function emitToChatMembers(
  io: Server,
  chatId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const prisma = getPrisma();
  const members = await prisma.chatMember.findMany({
    where: { chatId, leftAt: null },
    select: { userId: true },
  });
  for (const { userId } of members) {
    io.to(roomUser(userId)).emit(event, payload);
  }
}
