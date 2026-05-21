import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, Phone, Video } from 'lucide-react';
import { formatCallHistoryTimestamp } from '../../../utils/timeFormat';
import { useCallHistory, type CallHistoryRow } from '../useCallHistory';
import { useCall } from '../CallProvider';
import { groupCallHistoryRows } from '../utils/groupCallHistory';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './CallHistoryPanel.module.css';

type CallHistoryPanelProps = {
  chatId: string;
  peerUserId?: string;
  peerDisplayName?: string;
  peerAvatarUrl?: string | null;
  peerEmail?: string;
};

function CallDirectionIcon({ direction }: { direction: CallHistoryRow['direction'] }) {
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

const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({
  chatId,
  peerUserId,
  peerDisplayName,
  peerAvatarUrl,
  peerEmail,
}) => {
  const [filter, setFilter] = useState<'all' | 'missed' | 'dialed' | 'received'>('all');
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useCallHistory(
    chatId,
    filter,
  );
  const { startCall, phase } = useCall();

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );

  const groups = useMemo(() => groupCallHistoryRows(rows), [rows]);

  const displayName =
    peerDisplayName ?? rows[0]?.peer?.displayName ?? rows[0]?.peer?.email ?? 'Contact';

  const handleRedial = (row: CallHistoryRow) => {
    if (!peerUserId || phase !== 'idle') return;
    const name = peerDisplayName ?? row.peer?.displayName ?? row.peer?.email ?? 'Contact';
    void startCall({
      chatId,
      peerUserId: row.peer?.id ?? peerUserId,
      peerDisplayName: name,
      video: row.kind === 'VIDEO',
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        {(['all', 'missed', 'dialed', 'received'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? styles.filterActive : styles.filter}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {isLoading && <p className={styles.empty}>Loading…</p>}
      {!isLoading && groups.length === 0 && (
        <p className={styles.empty}>No calls in this chat yet.</p>
      )}
      <ul className={styles.list}>
        {groups.map((group) => {
          const isMissed = group.direction === 'missed';
          const avatarUrl = peerAvatarUrl ?? group.latestCall.peer?.avatarUrl;
          const avatarEmail = peerEmail ?? group.latestCall.peer?.email;
          const avatarUserId = peerUserId ?? group.latestCall.peer?.id;

          return (
            <li key={group.id} className={styles.listItem}>
              <button
                type="button"
                className={styles.row}
                onClick={() => handleRedial(group.latestCall)}
                disabled={phase !== 'idle'}
              >
                <UserAvatar
                  userId={avatarUserId}
                  avatarUrl={avatarUrl}
                  displayName={displayName}
                  email={avatarEmail}
                  className={styles.avatar}
                  fallbackFontSize="1.1rem"
                />
                <div className={styles.body}>
                  <span className={`${styles.name} ${isMissed ? styles.nameMissed : ''}`}>
                    {displayName}
                  </span>
                  <div className={styles.meta}>
                    <CallDirectionIcon direction={group.direction} />
                    {group.count > 1 && (
                      <span className={styles.callCount}>({group.count})</span>
                    )}
                    <span className={styles.time}>
                      {formatCallHistoryTimestamp(group.startedAt)}
                    </span>
                  </div>
                </div>
                <span
                  className={styles.callType}
                  aria-label={group.kind === 'VIDEO' ? 'Video call' : 'Audio call'}
                >
                  {group.kind === 'VIDEO' ? (
                    <Video size={22} strokeWidth={1.75} />
                  ) : (
                    <Phone size={22} strokeWidth={1.75} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          className={styles.loadMore}
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 size={16} className={styles.spinner} />
              Loading…
            </>
          ) : (
            'Load More'
          )}
        </button>
      )}
    </div>
  );
};

export default CallHistoryPanel;
