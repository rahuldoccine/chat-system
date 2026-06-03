import type { CallHistoryRow } from '../useCallHistory';

export type CallHistoryFilter = 'all' | 'missed' | 'video' | 'audio';

export function filterCallHistoryRows(
  rows: CallHistoryRow[],
  filter: CallHistoryFilter,
): CallHistoryRow[] {
  if (filter === 'all') return rows;
  if (filter === 'missed') {
    return rows.filter((r) => r.direction === 'missed' || r.status === 'missed');
  }
  if (filter === 'video') {
    return rows.filter((r) => r.kind === 'VIDEO');
  }
  return rows.filter((r) => r.kind === 'AUDIO');
}
