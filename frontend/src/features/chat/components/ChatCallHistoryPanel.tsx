import React, { useState } from 'react';
import { Phone, Video } from 'lucide-react';
import { CallDirectionIcon } from '../../calls/components/CallDirectionIcon';
import panelStyles from './ChatPanel.module.css';
import CallHistoryPanel from '../../calls/components/CallHistoryPanel';
import { useChat } from '../../../context/ChatContext';
import { useConversations, useMessages } from '../hooks/useChatData';
import type { Chat } from '../types';
import {
  buildGroupCallHistoryRows,
  type GroupCallHistoryRow,
} from './groupCallHistoryBuilder';
import {
  callHistoryDayLabel,
  formatCallDateTime,
  formatCallDirection,
  formatCallDuration,
  formatGroupCallStatusBadge,
  groupCallStatusToneClass,
} from '../../calls/utils/callHistory.helpers';
import styles from './ChatCallHistoryPanel.module.css';
import { useAuth } from '../../../context/AuthContext';
import ChatAvatar from './ChatAvatar';
import EmptyState from './EmptyState';

function groupCallTitle(kind: GroupCallHistoryRow['kind']): string {
  return kind === 'VIDEO' ? 'Video group call' : 'Audio group call';
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
        const key = callHistoryDayLabel(row.startedAt ?? row.endedAt);
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
                    const toneClass = groupCallStatusToneClass(row.status, {
                      good: styles.groupStatusGood,
                      warn: styles.groupStatusWarn,
                      bad: styles.groupStatusBad,
                    });
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
                            <div className={styles.groupHeader}>
                              <p className={styles.groupTitle}>{groupCallTitle(row.kind)}</p>
                              <span className={`${styles.groupStatus} ${toneClass}`}>
                                {formatGroupCallStatusBadge(row.status)}
                              </span>
                              <span
                                className={styles.groupCallType}
                                aria-label={row.kind === 'VIDEO' ? 'Video call' : 'Audio call'}
                              >
                                {row.kind === 'VIDEO' ? (
                                  <Video size={20} strokeWidth={1.75} />
                                ) : (
                                  <Phone size={20} strokeWidth={1.75} />
                                )}
                              </span>
                            </div>
                            <div className={styles.groupMeta}>
                              <CallDirectionIcon
                                direction={row.direction}
                                classNames={{
                                  outgoing: styles.arrowOutgoing,
                                  missed: styles.arrowMissed,
                                  incoming: styles.arrowIncoming,
                                }}
                              />
                              <span className={styles.groupMetaText}>
                                {formatCallDirection(row)} ·{' '}
                                {row.startedAt
                                  ? formatCallDateTime(row.startedAt)
                                  : formatCallDateTime(row.endedAt)}
                              </span>
                            </div>
                            <div className={styles.groupSubMeta}>Started by {row.actor}</div>
                            <p className={styles.groupCompact}>
                              <span className={styles.groupCompactStrong}>
                                {formatCallDuration(row.durationSec)}
                              </span>
                              {row.startedAt ? (
                                <>
                                  {' '}
                                  · {formatCallDateTime(row.startedAt)}
                                </>
                              ) : null}
                            </p>
                            <div className={styles.groupDetails}>
                              <div className={styles.groupDetail}>
                                Started at: {formatCallDateTime(row.startedAt)}
                              </div>
                              <div className={styles.groupDetail}>
                                Ended at: {formatCallDateTime(row.endedAt)}
                              </div>
                              <div className={styles.groupDetailStrong}>
                                Duration: {formatCallDuration(row.durationSec)}
                              </div>
                            </div>
                          </div>
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
