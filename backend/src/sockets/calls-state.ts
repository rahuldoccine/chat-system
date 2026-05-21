export type ActiveCall = {
  callId: string;
  chatId: string;
  initiatorId: string;
  peerId: string;
  kind: "AUDIO" | "VIDEO";
  status: "INITIATED" | "RINGING" | "CONNECTED" | "ENDED";
  createdAt: number;
  connectedAt: number | null;
  iceCount: { initiator: number; peer: number };
  timeoutId: NodeJS.Timeout | null;
};

const active = new Map<string, ActiveCall>();

export function getActiveCall(callId: string): ActiveCall | undefined {
  return active.get(callId);
}

export function getActiveCallForUser(userId: string): ActiveCall | undefined {
  for (const c of active.values()) {
    if (c.initiatorId === userId || c.peerId === userId) return c;
  }
  return undefined;
}

export function isUserInCall(userId: string): boolean {
  return getActiveCallForUser(userId) !== undefined;
}

export function markCallConnected(callId: string): void {
  const c = active.get(callId);
  if (!c) return;
  c.status = "CONNECTED";
  c.connectedAt = Date.now();
}

export function putActiveCall(call: ActiveCall): void {
  active.set(call.callId, call);
}

export function endActiveCall(callId: string): void {
  const c = active.get(callId);
  if (c?.timeoutId) {
    clearTimeout(c.timeoutId);
  }
  active.delete(callId);
}

