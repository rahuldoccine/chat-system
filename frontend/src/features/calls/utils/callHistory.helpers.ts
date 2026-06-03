import type { CallHistoryRow } from '../useCallHistory';

export type CallDirection = 'dialed' | 'received' | 'missed';

export function formatCallDirection(row: { direction: CallDirection }): string {
  if (row.direction === 'dialed') return 'Outgoing';
  if (row.direction === 'received') return 'Incoming';
  return 'Missed';
}

export function callDirectionIconPrefix(direction: CallDirection): string {
  if (direction === 'dialed') return '⬆️';
  if (direction === 'received') return '⬇️';
  return '🔴';
}

export function formatCallTypeLabel(kind: CallHistoryRow['kind']): string {
  return kind === 'VIDEO' ? 'Video' : 'Audio';
}

export type CallStatusTone = 'completed' | 'missed' | 'cancelled' | 'declined';

export function resolveCallStatusTone(status: CallHistoryRow['status']): CallStatusTone {
  if (status === 'missed') return 'missed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'rejected') return 'declined';
  return 'completed';
}

export function formatGroupCallStatusBadge(
  status: 'Cancelled' | 'Ended' | 'Missed join',
): string {
  if (status === 'Ended') return '🟢 Completed';
  if (status === 'Missed join') return '🔴 Missed';
  return '🟡 Cancelled';
}

export function groupCallStatusToneClass(
  status: 'Cancelled' | 'Ended' | 'Missed join',
  classes: { good: string; warn: string; bad: string },
): string {
  if (status === 'Ended') return classes.good;
  if (status === 'Missed join') return classes.warn;
  return classes.bad;
}

export function formatCallStatusBadge(status: CallHistoryRow['status']): string {
  if (status === 'completed') return '🟢 Completed';
  if (status === 'missed') return '🔴 Missed';
  if (status === 'cancelled') return '🟡 Cancelled';
  return '⚪ Declined';
}

export function formatCallDuration(totalSec: number | null): string {
  if (totalSec === null) return '00:00';
  const sec = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatCallDateTime(value: string | null): string {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

export function callHistoryToDayKey(value: string | null): string {
  if (!value) return 'unknown';
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function callHistoryDayLabel(value: string | null): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (callHistoryToDayKey(value) === callHistoryToDayKey(now.toISOString())) return 'Today';
  if (callHistoryToDayKey(value) === callHistoryToDayKey(y.toISOString())) return 'Yesterday';
  return d.toLocaleDateString();
}

