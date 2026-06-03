import type { Message } from '../types';

const CANCELLED_DURATION_SEC = 15;

export type GroupCallEvent = {
  id: string;
  type: 'group_call_started' | 'group_call_ended';
  actorId: string;
  actor: string;
  callKind: 'AUDIO' | 'VIDEO';
  createdAt: string;
};

export type GroupCallHistoryRow = {
  id: string;
  actorId: string;
  actor: string;
  kind: 'AUDIO' | 'VIDEO';
  direction: 'dialed' | 'received' | 'missed';
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  status: 'Cancelled' | 'Ended' | 'Missed join';
};

function parseGroupCallEvent(message: Message): GroupCallEvent | null {
  if (message.kind !== 'SYSTEM') return null;
  const meta = (message.contentMeta ?? {}) as {
    groupActivity?: {
      type?: 'group_call_started' | 'group_call_ended';
      actorId?: string;
      actorName?: string;
      kind?: 'AUDIO' | 'VIDEO';
    };
  };
  const activityType = meta.groupActivity?.type;
  if (activityType !== 'group_call_started' && activityType !== 'group_call_ended') {
    return null;
  }
  const text = (message.ciphertext ?? '').toLowerCase();
  const callKind: 'AUDIO' | 'VIDEO' =
    meta.groupActivity?.kind === 'VIDEO' || text.includes('video') ? 'VIDEO' : 'AUDIO';
  return {
    id: message.id,
    type: activityType,
    actorId: meta.groupActivity?.actorId ?? message.senderId,
    actor: meta.groupActivity?.actorName ?? message.sender.displayName ?? message.sender.email ?? 'Someone',
    callKind,
    createdAt: message.createdAt,
  };
}

function missedJoinRow(openStart: GroupCallEvent, viewerUserId?: string): GroupCallHistoryRow {
  return {
    id: `missed-${openStart.id}`,
    actorId: openStart.actorId,
    actor: openStart.actor,
    kind: openStart.callKind,
    direction: openStart.actorId === viewerUserId ? 'dialed' : 'missed',
    startedAt: openStart.createdAt,
    endedAt: null,
    durationSec: null,
    status: 'Missed join',
  };
}

function sessionRow(
  openStart: GroupCallEvent,
  endEvent: GroupCallEvent,
  viewerUserId?: string,
): GroupCallHistoryRow {
  const startedMs = new Date(openStart.createdAt).getTime();
  const endedMs = new Date(endEvent.createdAt).getTime();
  const durationSec = Math.max(0, Math.floor((endedMs - startedMs) / 1000));
  return {
    id: `session-${openStart.id}-${endEvent.id}`,
    actorId: openStart.actorId,
    actor: openStart.actor,
    kind: openStart.callKind,
    direction: openStart.actorId === viewerUserId ? 'dialed' : 'received',
    startedAt: openStart.createdAt,
    endedAt: endEvent.createdAt,
    durationSec,
    status: durationSec < CANCELLED_DURATION_SEC ? 'Cancelled' : 'Ended',
  };
}

export function buildGroupCallHistoryRows(messages: Message[], viewerUserId?: string): GroupCallHistoryRow[] {
  const events = messages
    .map(parseGroupCallEvent)
    .filter((e): e is GroupCallEvent => e !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rows: GroupCallHistoryRow[] = [];
  let openStart: GroupCallEvent | null = null;

  for (const event of events) {
    if (event.type === 'group_call_started') {
      if (openStart) rows.push(missedJoinRow(openStart, viewerUserId));
      openStart = event;
      continue;
    }

    if (openStart) {
      rows.push(sessionRow(openStart, event, viewerUserId));
      openStart = null;
    } else {
      rows.push({
        id: `ended-${event.id}`,
        actorId: event.actorId,
        actor: event.actor,
        kind: event.callKind,
        direction: event.actorId === viewerUserId ? 'dialed' : 'received',
        startedAt: null,
        endedAt: event.createdAt,
        durationSec: 0,
        status: 'Ended',
      });
    }
  }

  if (openStart) rows.push(missedJoinRow(openStart, viewerUserId));

  return rows.sort((a, b) => {
    const aTs = new Date(a.startedAt ?? a.endedAt ?? 0).getTime();
    const bTs = new Date(b.startedAt ?? b.endedAt ?? 0).getTime();
    return bTs - aTs;
  });
}
