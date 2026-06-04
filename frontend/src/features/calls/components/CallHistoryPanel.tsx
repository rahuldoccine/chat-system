import React, { useMemo, useState } from 'react';
import { handler } from '../../../utils/asyncHandler';
import { Loader2, Phone, Video } from 'lucide-react';
import { CallDirectionIcon } from './CallDirectionIcon';
import { formatCallHistoryTimestamp } from '../../../utils/timeFormat';
import { useCallHistory } from '../useCallHistory';
import { filterCallHistoryRows } from '../utils/callHistoryFilters';
import { useCall } from '../CallProvider';
import UserAvatar from '../../chat/components/UserAvatar';
import EmptyState from '../../chat/components/EmptyState';
import {
  callDirectionIconPrefix,
  formatCallDirection,
  formatCallStatusBadge,
  formatCallTypeLabel,
  resolveCallStatusTone,
} from '../utils/callHistory.helpers';
import styles from './CallHistoryPanel.module.css';

type CallHistoryPanelProps = Readonly<{
  chatId: string;
  peerUserId?: string;
  peerDisplayName?: string;
  peerAvatarUrl?: string | null;
  peerEmail?: string;
}>;

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
    const base = filterCallHistoryRows(rows, filter);
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
        <EmptyState
          compact
          title="No call history yet"
          hint="Start your first call with teammates."
        />
      )}
      <ul className={styles.list}>
        {filteredRows.map((row) => {
          const isMissed = row.direction === 'missed';
          const avatarUrl = peerAvatarUrl ?? row.peer?.avatarUrl;
          const avatarEmail = peerEmail ?? row.peer?.email;
          const avatarUserId = peerUserId ?? row.peer?.id;
          const statusToneClass = {
            completed: styles.statusCompleted,
            missed: styles.statusMissed,
            cancelled: styles.statusCancelled,
            declined: styles.statusDeclined,
          }[resolveCallStatusTone(row.status)];
          const directionLabel = formatCallDirection(row);
          const typeLabel = formatCallTypeLabel(row.kind);
          const iconPrefix = callDirectionIconPrefix(row.direction);

          const redial = (video: boolean) => {
            if (!peerUserId || phase !== 'idle') return;
            const name = peerDisplayName ?? row.peer?.displayName ?? row.peer?.email ?? 'Contact';
            void startCall({
              chatId,
              peerUserId: row.peer?.id ?? peerUserId,
              peerDisplayName: name,
              video,
            });
          };

          return (
            <li key={row.id} className={styles.listItem}>
              <div className={styles.row}>
                <UserAvatar
                  userId={avatarUserId}
                  avatarUrl={avatarUrl}
                  displayName={displayName}
                  email={avatarEmail}
                  className={styles.avatar}
                  fallbackFontSize="1.1rem"
                />
                <div className={styles.body}>
                  <div className={styles.titleRow}>
                    <span className={`${styles.name} ${isMissed ? styles.nameMissed : ''}`}>
                      {peerDisplayName ?? row.peer?.displayName ?? row.peer?.email ?? displayName}
                    </span>
                    <span
                      className={styles.callType}
                      aria-label={row.kind === 'VIDEO' ? 'Video call' : 'Audio call'}
                    >
                      {row.kind === 'VIDEO' ? (
                        <Video size={20} strokeWidth={1.75} />
                      ) : (
                        <Phone size={20} strokeWidth={1.75} />
                      )}
                    </span>
                  </div>
                  <div className={styles.meta}>
                    <CallDirectionIcon
                      direction={row.direction}
                      classNames={{
                        outgoing: styles.arrowOutgoing,
                        missed: styles.arrowMissed,
                        incoming: styles.arrowIncoming,
                      }}
                    />
                    <span className={styles.time}>
                      {iconPrefix} {directionLabel} {typeLabel}
                    </span>
                    <span className={`${styles.statusBadge} ${statusToneClass}`}>
                      {formatCallStatusBadge(row.status)}
                    </span>
                  </div>
                  <div className={styles.detailGrid}>
                    <span className={styles.detailPrimary}>
                      {formatCallHistoryTimestamp(row.startedAt)} · {formatDuration(row.durationSec)}
                    </span>
                    <span className={styles.detailExtra}>
                      Started {formatDateTime(row.startedAt)} · Ended {formatDateTime(row.endedAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() => redial(row.kind === 'VIDEO')}
                  disabled={phase !== 'idle'}
                >
                  <Phone size={14} /> Call again
                </button>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() => redial(true)}
                  disabled={phase !== 'idle'}
                >
                  <Video size={14} /> Video
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
          onClick={handler(() => {
            void fetchNextPage();
          })}
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
