import type { Server } from "socket.io";

import { emitToChatMembers } from "./chat-broadcast.js";

/** Deliver `message:new` to every active member via their personal socket room. */
export async function emitMessageNewToMembers(
  io: Server,
  chatId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await emitToChatMembers(io, chatId, "message:new", payload);
}
