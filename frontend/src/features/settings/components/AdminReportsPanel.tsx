import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminReports,
  REPORTS_PAGE_SIZE,
  type AdminReport,
  type AdminReportsFilter,
  type ReportStatus,
} from '../hooks/useAdminReports';
import { getApiErrorMessage } from '../hooks/useUserSettings';
import EditReportModal from './EditReportModal';
import styles from './AdminReportsPanel.module.css';

function formatUser(u: { displayName: string | null; email: string }) {
  return u.displayName?.trim() || u.email;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Open',
  REVIEWED: 'Reviewed',
  DISMISSED: 'Dismissed',
  ACTIONED: 'Actioned',
};

const FILTER_TABS: { id: AdminReportsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'REVIEWED', label: 'Reviewed' },
  { id: 'DISMISSED', label: 'Dismissed' },
  { id: 'ACTIONED', label: 'Actioned' },
];

const STATUS_BADGE_CLASS: Record<ReportStatus, string> = {
  OPEN: styles.badge_OPEN,
  REVIEWED: styles.badge_REVIEWED,
  DISMISSED: styles.badge_DISMISSED,
  ACTIONED: styles.badge_ACTIONED,
};

function statusBadgeClassName(status: ReportStatus): string {
  return `${styles.badge} ${STATUS_BADGE_CLASS[status]}`;
}

function emptyReportsMessage(filter: AdminReportsFilter): string {
  if (filter === 'all') return 'No reports yet.';
  return `No ${STATUS_LABELS[filter].toLowerCase()} reports.`;
}

function formatReportsPageInfo(
  hasReports: boolean,
  pageStart: number,
  pageEnd: number,
  hasNext: boolean,
): string {
  if (!hasReports) return 'No results';
  const suffix = hasNext ? '+' : '';
  return `${pageStart}–${pageEnd}${suffix}`;
}

type ReportRowProps = Readonly<{
  report: AdminReport;
  onEdit: (report: AdminReport) => void;
}>;

const ReportRow: React.FC<ReportRowProps> = ({ report, onEdit }) => (
  <article className={styles.row}>
    <div className={styles.rowTop}>
      <div className={styles.rowHeader}>
        <span className={statusBadgeClassName(report.status)}>
          {STATUS_LABELS[report.status]}
        </span>
        <time className={styles.date} dateTime={report.createdAt}>
          {formatDate(report.createdAt)}
        </time>
      </div>
      <button
        type="button"
        className={styles.editBtn}
        aria-label={`Edit report - ${report.reason}`}
        onClick={() => onEdit(report)}
      >
        <Pencil size={16} />
      </button>
    </div>

    <p className={styles.reason}>
      <strong>Reason:</strong> {report.reason}
    </p>

    {report.details && <p className={styles.details}>{report.details}</p>}

    <dl className={styles.meta}>
      <div>
        <dt>Reporter</dt>
        <dd>{formatUser(report.reporter)}</dd>
      </div>
      <div>
        <dt>Reported user</dt>
        <dd>{report.targetUser ? formatUser(report.targetUser) : '-'}</dd>
      </div>
    </dl>

    {report.reviewedAt && report.status !== 'OPEN' && (
      <p className={styles.reviewedAt}>
        Reviewed {formatDate(report.reviewedAt)}
      </p>
    )}
  </article>
);

const AdminReportsPanel: React.FC = () => {
  const [filter, setFilter] = useState<AdminReportsFilter>('OPEN');
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [editingReport, setEditingReport] = useState<AdminReport | null>(null);

  const currentCursor = cursors[pageIndex];

  const { data, isLoading, isError, error, isFetching } = useAdminReports(
    filter,
    currentCursor,
  );

  const reports = data?.data ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const hasNext = Boolean(nextCursor);
  const hasPrev = pageIndex > 0;

  const resetPagination = useCallback(() => {
    setPageIndex(0);
    setCursors([undefined]);
  }, []);

  useEffect(() => {
    resetPagination();
  }, [filter, resetPagination]);

  const handleFilterChange = (next: AdminReportsFilter) => {
    setFilter(next);
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursors((prev) => {
      const trimmed = prev.slice(0, pageIndex + 1);
      return [...trimmed, nextCursor];
    });
    setPageIndex((i) => i + 1);
  };

  const handlePrevPage = () => {
    if (pageIndex <= 0) return;
    setPageIndex((i) => i - 1);
  };

  const handleSaved = () => {
    toast.success('Report updated');
  };

  const pageStart = pageIndex * REPORTS_PAGE_SIZE + 1;
  const pageEnd = pageIndex * REPORTS_PAGE_SIZE + reports.length;
  const showPagination = reports.length > 0 || hasPrev || hasNext;

  const emptyMessage = emptyReportsMessage(filter);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.filters} role="tablist" aria-label="Report status filters">
          {FILTER_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`${styles.filterBtn} ${filter === id ? styles.filterBtnActive : ''}`}
              onClick={() => handleFilterChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={styles.pageSizeHint}>{REPORTS_PAGE_SIZE} reports per page</p>
      </div>

      {isLoading && (
        <div className={styles.loading}>
          <Loader2 size={22} className={styles.spinner} />
        </div>
      )}

      {isError && (
        <p className={styles.error}>
          {getApiErrorMessage(error, "Reports couldn't be loaded. Please try again.")}
        </p>
      )}

      {!isLoading && !isError && reports.length === 0 && (
        <p className={styles.empty}>{emptyMessage}</p>
      )}

      {!isLoading && !isError && reports.length > 0 && (
        <>
          <div className={`${styles.list} ${isFetching ? styles.listFetching : ''}`}>
            {reports.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                onEdit={setEditingReport}
              />
            ))}
          </div>

          {showPagination && (
            <nav className={styles.pagination} aria-label="Reports pagination">
              <button
                type="button"
                className={styles.pageBtn}
                disabled={!hasPrev || isFetching}
                onClick={handlePrevPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
                Previous
              </button>
              <span className={styles.pageInfo}>
                {formatReportsPageInfo(reports.length > 0, pageStart, pageEnd, hasNext)}
                {isFetching && (
                  <Loader2 size={14} className={styles.spinnerInline} aria-hidden />
                )}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={!hasNext || isFetching}
                onClick={handleNextPage}
                aria-label="Next page"
              >
                Next
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
        </>
      )}

      {editingReport && (
        <EditReportModal
          report={editingReport}
          onClose={() => setEditingReport(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default AdminReportsPanel;
