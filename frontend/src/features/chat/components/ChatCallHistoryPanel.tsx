import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import panelStyles from './ChatPanel.module.css';
import CallHistoryPanel from '../../calls/components/CallHistoryPanel';
import { useChat } from '../../../context/ChatContext';
import { useConversations, useMessages } from '../hooks/useChatData';
import type { Chat, Message } from '../types';
import styles from './ChatCallHistoryPanel.module.css';
import { useAuth } from '../../../context/AuthContext';
import ChatAvatar from './ChatAvatar';
import EmptyState from './EmptyState';

type GroupCallEvent = {
  id: string;
  type: 'group_call_started' | 'group_call_ended';
  actorId: string;
  actor: string;
  callKind: 'AUDIO' | 'VIDEO';
  createdAt: string;
};

type GroupCallHistoryRow = {
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

const CANCELLED_DURATION_SEC = 15;

function formatDuration(totalSec: number | null): string {
  if (totalSec === null) return '00:00';
  const sec = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

function toDayKey(value: string | null): string {
  if (!value) return 'unknown';
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(value: string | null): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (toDayKey(value) === toDayKey(now.toISOString())) return 'Today';
  if (toDayKey(value) === toDayKey(y.toISOString())) return 'Yesterday';
  return d.toLocaleDateString();
}

function CallDirectionIcon({ direction }: { direction: GroupCallHistoryRow['direction'] }) {
  if (direction === 'dialed') {
    return (
      <span className={styles.arrowOutgoing} aria-label="Outgoing call">
        <ArrowUpRight size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (direction === 'missed') {
    return (
      <span className={styles.arrowMissed} aria-label="Missed call">
        <ArrowDownLeft size={14} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={styles.arrowIncoming} aria-label="Incoming call">
      <ArrowDownLeft size={14} strokeWidth={2.5} />
    </span>
  );
}

function buildGroupCallHistoryRows(messages: Message[], viewerUserId?: string): GroupCallHistoryRow[] {
  const events: GroupCallEvent[] = messages
    .filter((m) => {
      if (m.kind !== 'SYSTEM') return false;
      const meta = (m.contentMeta ?? {}) as { groupActivity?: { type?: string } };
      const t = meta.groupActivity?.type;
      return t === 'group_call_started' || t === 'group_call_ended';
    })
    .map((m) => {
      const meta = (m.contentMeta ?? {}) as {
        groupActivity?: {
          type?: 'group_call_started' | 'group_call_ended';
          actorId?: string;
          actorName?: string;
          kind?: 'AUDIO' | 'VIDEO';
        };
      };
      const text = (m.ciphertext ?? '').toLowerCase();
      const callKind: 'AUDIO' | 'VIDEO' =
        meta.groupActivity?.kind === 'VIDEO' || text.includes('video') ? 'VIDEO' : 'AUDIO';
      return {
        id: m.id,
        type: meta.groupActivity?.type ?? 'group_call_started',
        actorId: meta.groupActivity?.actorId ?? m.senderId,
        actor: meta.groupActivity?.actorName ?? m.sender.displayName ?? m.sender.email ?? 'Someone',
        callKind,
        createdAt: m.createdAt,
      } as GroupCallEvent;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rows: GroupCallHistoryRow[] = [];
  let openStart: GroupCallEvent | null = null;

  for (const event of events) {
    if (event.type === 'group_call_started') {
      if (openStart) {
        rows.push({
          id: `missed-${openStart.id}`,
          actorId: openStart.actorId,
          actor: openStart.actor,
          kind: openStart.callKind,
          direction: openStart.actorId === viewerUserId ? 'dialed' : 'missed',
          startedAt: openStart.createdAt,
          endedAt: null,
          durationSec: null,
          status: 'Missed join',
        });
      }
      openStart = event;
      continue;
    }

    if (openStart) {
      const startedMs = new Date(openStart.createdAt).getTime();
      const endedMs = new Date(event.createdAt).getTime();
      const durationSec = Math.max(0, Math.floor((endedMs - startedMs) / 1000));
      rows.push({
        id: `session-${openStart.id}-${event.id}`,
        actorId: openStart.actorId,
        actor: openStart.actor,
        kind: openStart.callKind,
        direction: openStart.actorId === viewerUserId ? 'dialed' : 'received',
        startedAt: openStart.createdAt,
        endedAt: event.createdAt,
        durationSec,
        status: durationSec < CANCELLED_DURATION_SEC ? 'Cancelled' : 'Ended',
      });
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

  if (openStart) {
    rows.push({
      id: `missed-${openStart.id}`,
      actorId: openStart.actorId,
      actor: openStart.actor,
      kind: openStart.callKind,
      direction: openStart.actorId === viewerUserId ? 'dialed' : 'missed',
      startedAt: openStart.createdAt,
      endedAt: null,
      durationSec: null,
      status: 'Missed join',
    });
  }

  return rows
    .map((row) => row)
    .sort((a, b) => {
      const aTs = new Date(a.startedAt ?? a.endedAt ?? 0).getTime();
      const bTs = new Date(b.startedAt ?? b.endedAt ?? 0).getTime();
      return bTs - aTs;
    });
}

const ChatCallHistoryPanel: React.FC = () => {
  const { activeId } = useChat();
  const { user } = useAuth();
  const { data: conversations } = useConversations();
  const chat = (conversations as { data?: Chat[] } | undefined)?.data?.find((c) => c.id === activeId);
  const { data: groupMessages, isLoading: groupHistoryLoading } = useMessages(
    chat?.type === 'GROUP' ? chat.id : null,
  );
  const [groupFilter, setGroupFilter] = useState<'all' | 'missed' | 'video' | 'audio' | 'group'>('all');

  if (!chat) {
    return null;
  }

  if (chat.type === 'GROUP') {
    const callRows = buildGroupCallHistoryRows(groupMessages ?? [], user?.id);
    const filtered = (() => {
      if (groupFilter === 'all' || groupFilter === 'group') return callRows;
      if (groupFilter === 'missed') return callRows.filter((r) => r.status === 'Missed join');
      if (groupFilter === 'video') return callRows.filter((r) => r.kind === 'VIDEO');
      return callRows.filter((r) => r.kind === 'AUDIO');
    })();
    const counts = {
      all: callRows.length,
      missed: callRows.filter((r) => r.status === 'Missed join').length,
      video: callRows.filter((r) => r.kind === 'VIDEO').length,
      audio: callRows.filter((r) => r.kind === 'AUDIO').length,
      group: callRows.length,
    };
    const timeline = (() => {
      const map = new Map<string, typeof filtered>();
      for (const row of filtered) {
        const key = dayLabel(row.startedAt ?? row.endedAt);
        const list = map.get(key) ?? [];
        list.push(row);
        map.set(key, list);
      }
      return [...map.entries()];
    })();

    return (
      <div className={panelStyles.panel}>
        <div className={styles.groupFilters}>
          {(['all', 'missed', 'video', 'audio', 'group'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={groupFilter === f ? styles.groupFilterActive : styles.groupFilter}
              onClick={() => setGroupFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{' '}
              <span className={styles.groupFilterCount}>{counts[f]}</span>
            </button>
          ))}
        </div>
        {groupHistoryLoading ? <p className={panelStyles.empty}>Loading…</p> : null}
        {!groupHistoryLoading && filtered.length === 0 ? (
          <EmptyState
            compact
            title="No call history yet"
            hint="Start your first call with teammates."
          />
        ) : null}
        {!groupHistoryLoading && filtered.length > 0 ? (
          <div className={styles.timeline}>
            {timeline.map(([label, rows]) => (
              <div key={label} className={styles.timelineSection}>
                <div className={styles.timelineHeading}>{label}</div>
                <ul className={styles.groupList}>
                  {rows.map((row) => {
                    const toneClass =
                      row.status === 'Ended'
                        ? styles.groupStatusGood
                        : row.status === 'Missed join'
                          ? styles.groupStatusWarn
                          : styles.groupStatusBad;
                    return (
                      <li key={row.id} className={styles.groupItem}>
                        <div className={styles.groupRow}>
                          <ChatAvatar
                            chat={chat}
                            chatName={chat.title ?? 'Group'}
                            size={48}
                            borderRadius="50%"
                            className={styles.groupAvatar}
                          />
                          <div className={styles.groupBody}>
                            <div className={styles.groupTop}>
                              <div className={styles.groupTitle}>{row.kind === 'VIDEO' ? '📹' : '📞'} {row.kind === 'VIDEO' ? 'Video' : 'Audio'} Group Call</div>
                              <span className={`${styles.groupStatus} ${toneClass}`}>
                                {row.status === 'Ended'
                                  ? '🟢 Completed'
                                  : row.status === 'Missed join'
                                    ? '🔴 Missed'
                                    : '🟡 Cancelled'}
                              </span>
                            </div>
                            <div className={styles.groupMeta}>
                              <CallDirectionIcon direction={row.direction} />
                              <span>{row.direction === 'dialed' ? 'Outgoing' : row.direction === 'received' ? 'Incoming' : 'Missed'} • {row.startedAt ? formatDateTime(row.startedAt) : formatDateTime(row.endedAt)}</span>
                            </div>
                            <div className={styles.groupSubMeta}>Started by {row.actor}</div>
                            <div className={styles.groupDetail}>Started at: {formatDateTime(row.startedAt)}</div>
                            <div className={styles.groupDetail}>Ended at: {formatDateTime(row.endedAt)}</div>
                            <div className={styles.groupDetailStrong}>
                              Duration: {formatDuration(row.durationSec)}
                            </div>
                          </div>
                          <span className={styles.groupCallType} aria-label={row.kind === 'VIDEO' ? 'Video call' : 'Audio call'}>
                            {row.kind === 'VIDEO' ? (
                              <Video size={22} strokeWidth={1.75} />
                            ) : (
                              <Phone size={22} strokeWidth={1.75} />
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (chat.type !== 'DIRECT' || !chat.dmPeer) {
    return (
      <div className={panelStyles.panel}>
        <p className={panelStyles.empty}>Call history is available in direct messages.</p>
      </div>
    );
  }

  const peerName = chat.dmPeer.displayName ?? chat.dmPeer.email ?? 'Contact';

  return (
    <div className={panelStyles.panel}>
      <CallHistoryPanel
        chatId={chat.id}
        peerUserId={chat.dmPeer.id}
        peerDisplayName={peerName}
        peerAvatarUrl={chat.dmPeer.avatarUrl}
        peerEmail={chat.dmPeer.email}
      />
    </div>
  );
};

export default ChatCallHistoryPanel;
