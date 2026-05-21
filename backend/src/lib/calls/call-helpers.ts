import type { CallKind, CallLog, CallStatus } from "@prisma/client";

export type CallDirection = "dialed" | "received" | "missed";

export type CallContentStatus = "completed" | "missed" | "rejected" | "cancelled";

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function mapTerminalStatus(
  status: CallStatus,
  endReason?: string | null,
): CallContentStatus {
  if (status === "COMPLETED") return "completed";
  if (status === "MISSED") return "missed";
  if (endReason === "rejected") return "rejected";
  return "cancelled";
}

export function formatCallCiphertext(
  kind: CallKind,
  contentStatus: CallContentStatus,
  durationSec: number,
): string {
  const label = kind === "VIDEO" ? "Video call" : "Voice call";
  if (contentStatus === "missed") {
    return kind === "VIDEO" ? "Missed video call" : "Missed voice call";
  }
  if (contentStatus === "rejected") return "Call declined";
  if (contentStatus === "cancelled") return "Cancelled call";
  if (durationSec > 0) {
    return `${label} · ${formatDuration(durationSec)}`;
  }
  return label;
}

export function getCallDirection(
  viewerId: string,
  row: Pick<CallLog, "initiatorId" | "peerId" | "status">,
): CallDirection {
  if (row.status === "MISSED") {
    return row.initiatorId === viewerId ? "dialed" : "missed";
  }
  if (row.initiatorId === viewerId) return "dialed";
  return "received";
}
