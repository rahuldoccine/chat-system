import type { AccessTokenPayload } from "../lib/jwt.js";

declare module "socket.io" {
  interface SocketData {
    user: AccessTokenPayload;
    /** Chats this socket successfully joined via `chat:subscribe`. */
    subscribedChats: Set<string>;
    /** Active typing room for auto-stop and chat switch cleanup. */
    typingChatId?: string | null;
  }
}

export {};
