import { toDateKey } from '../../../utils/timeFormat';
import type { CallHistoryRow } from '../useCallHistory';

export type CallHistoryGroup = {
  id: string;
  latestCall: CallHistoryRow;
  calls: CallHistoryRow[];
  direction: CallHistoryRow['direction'];
  kind: CallHistoryRow['kind'];
  count: number;
  startedAt: string;
};

/** Group adjacent logs (newest-first) with same direction, kind, and calendar day — WhatsApp-style bursts. */
export function groupCallHistoryRows(rows: CallHistoryRow[]): CallHistoryGroup[] {
  const groups: CallHistoryGroup[] = [];

  for (const row of rows) {
    const prev = groups.at(-1);
    const sameBurst =
      prev &&
      prev.direction === row.direction &&
      prev.kind === row.kind &&
      toDateKey(prev.startedAt) === toDateKey(row.startedAt);

    if (sameBurst) {
      prev.calls.push(row);
      prev.count += 1;
    } else {
      groups.push({
        id: row.id,
        latestCall: row,
        calls: [row],
        direction: row.direction,
        kind: row.kind,
        count: 1,
        startedAt: row.startedAt,
      });
    }
  }

  return groups;
}
