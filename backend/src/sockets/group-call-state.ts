export type GroupCallParticipant = {
  userId: string;
  joinedAt: number;
};

export type ActiveGroupCall = {
  sessionId: string;
  chatId: string;
  initiatorId: string;
  kind: "AUDIO" | "VIDEO";
  createdAt: number;
  participants: Map<string, GroupCallParticipant>;
};

const sessions = new Map<string, ActiveGroupCall>();

export function getGroupCall(sessionId: string): ActiveGroupCall | undefined {
  return sessions.get(sessionId);
}

export function getActiveGroupCallForChat(chatId: string): ActiveGroupCall | undefined {
  for (const s of sessions.values()) {
    if (s.chatId === chatId) return s;
  }
  return undefined;
}

export function getActiveGroupCallForUser(userId: string): ActiveGroupCall | undefined {
  for (const s of sessions.values()) {
    if (s.participants.has(userId)) return s;
  }
  return undefined;
}

export function putGroupCall(call: ActiveGroupCall): void {
  sessions.set(call.sessionId, call);
}

export function endGroupCall(sessionId: string): void {
  sessions.delete(sessionId);
}
