import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Info, Loader2, MoreHorizontal, Phone, Video } from 'lucide-react';
import { formatCallHistoryTimestamp } from '../../../utils/timeFormat';
import { useCallHistory, type CallHistoryRow } from '../useCallHistory';
import { useCall } from '../CallProvider';
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

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || totalSec < 0) return '—';
  const sec = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({
  chatId,
  peerUserId,
  peerDisplayName,
  peerAvatarUrl,
  peerEmail,
}) => {
  const [filter, setFilter] = useState<'all' | 'missed' | 'video' | 'audio'>('all');
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useCallHistory(
    chatId,
    filter === 'missed' ? 'missed' : 'all',
  );
  const { startCall, phase } = useCall();

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );
  const filteredRows = useMemo(() => {
    const base =
      filter === 'all'
        ? rows
        : filter === 'missed'
          ? rows.filter((r) => r.direction === 'missed' || r.status === 'missed')
          : filter === 'video'
            ? rows.filter((r) => r.kind === 'VIDEO')
            : rows.filter((r) => r.kind === 'AUDIO');
    return [...base].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, [rows, filter]);
  const counts = useMemo(
    () => ({
      all: rows.length,
      missed: rows.filter((r) => r.direction === 'missed' || r.status === 'missed').length,
      video: rows.filter((r) => r.kind === 'VIDEO').length,
      audio: rows.filter((r) => r.kind === 'AUDIO').length,
    }),
    [rows],
  );

  const displayName = peerDisplayName ?? rows[0]?.peer?.displayName ?? rows[0]?.peer?.email ?? 'Contact';

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
        {(['all', 'missed', 'video', 'audio'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? styles.filterActive : styles.filter}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}{' '}
            <span className={styles.filterCount}>{counts[f]}</span>
          </button>
        ))}
      </div>
      {isLoading && <p className={styles.empty}>Loading…</p>}
      {!isLoading && filteredRows.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>📞</div>
          <div className={styles.emptyStateTitle}>No call history yet</div>
          <div className={styles.emptyStateHint}>Start your first call with teammates.</div>
        </div>
      )}
      <ul className={styles.list}>
        {filteredRows.map((row) => {
          const isMissed = row.direction === 'missed';
          const avatarUrl = peerAvatarUrl ?? row.peer?.avatarUrl;
          const avatarEmail = peerEmail ?? row.peer?.email;
          const avatarUserId = peerUserId ?? row.peer?.id;
          const statusTone =
            row.status === 'missed'
              ? styles.statusMissed
              : row.status === 'cancelled'
                ? styles.statusCancelled
                : row.status === 'rejected'
                  ? styles.statusDeclined
                  : styles.statusCompleted;
          const directionLabel =
            row.direction === 'dialed' ? 'Outgoing' : row.direction === 'received' ? 'Incoming' : 'Missed';
          const typeLabel = row.kind === 'VIDEO' ? 'Video' : 'Audio';
          const iconPrefix = row.direction === 'dialed' ? '⬆️' : row.direction === 'received' ? '⬇️' : '🔴';

          return (
            <li key={row.id} className={styles.listItem}>
              <button
                type="button"
                className={styles.row}
                onClick={() => handleRedial(row)}
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
                    {peerDisplayName ?? row.peer?.displayName ?? row.peer?.email ?? displayName}
                  </span>
                  <div className={styles.meta}>
                    <CallDirectionIcon direction={row.direction} />
                    <span className={styles.time}>{iconPrefix} {directionLabel} {typeLabel} Call</span>
                    <span className={`${styles.statusBadge} ${statusTone}`}>
                      {row.status === 'completed'
                        ? '🟢 Completed'
                        : row.status === 'missed'
                          ? '🔴 Missed'
                          : row.status === 'cancelled'
                            ? '🟡 Cancelled'
                            : '⚪ Declined'}
                    </span>
                  </div>
                  <div className={styles.detailGrid}>
                    <span>{formatCallHistoryTimestamp(row.startedAt)} • {formatDuration(row.durationSec)}</span>
                    <span>Started: {formatDateTime(row.startedAt)}</span>
                    <span>Ended: {formatDateTime(row.endedAt)}</span>
                  </div>
                  <div className={styles.actionRow}>
                    <span className={styles.actionChip}>Call Again</span>
                    <span className={styles.actionChip}>Info</span>
                    <span className={styles.actionChip}>⋮</span>
                  </div>
                </div>
                <span
                  className={styles.callType}
                  aria-label={row.kind === 'VIDEO' ? 'Video call' : 'Audio call'}
                >
                  {row.kind === 'VIDEO' ? (
                    <Video size={22} strokeWidth={1.75} />
                  ) : (
                    <Phone size={22} strokeWidth={1.75} />
                  )}
                </span>
              </button>
              <div className={styles.quickActions}>
                <button type="button" onClick={() => handleRedial(row)} disabled={phase !== 'idle'}>
                  <Phone size={14} /> Call Again
                </button>
                <button type="button">
                  <Video size={14} /> Video
                </button>
                <button type="button">
                  <Info size={14} /> Details
                </button>
                <button type="button" aria-label="More">
                  <MoreHorizontal size={14} />
                </button>
              </div>
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
