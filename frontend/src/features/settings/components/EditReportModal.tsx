import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  useUpdateReportStatus,
  type AdminReport,
  type ReportStatus,
} from '../hooks/useAdminReports';
import { getApiErrorMessage } from '../hooks/useUserSettings';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './EditReportModal.module.css';
import { handlerSubmit } from '../../../utils/asyncHandler';

const STATUS_OPTIONS: { value: ReportStatus; label: string; hint: string }[] = [
  { value: 'OPEN', label: 'Open', hint: 'Awaiting review' },
  { value: 'REVIEWED', label: 'Reviewed', hint: 'Seen by a moderator' },
  { value: 'DISMISSED', label: 'Dismissed', hint: 'No action required' },
  { value: 'ACTIONED', label: 'Actioned', hint: 'Enforcement or follow-up taken' },
];

function formatUser(u: { displayName: string | null; email: string }) {
  return u.displayName?.trim() || u.email;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type EditReportModalProps = {
  report: AdminReport;
  onClose: () => void;
  onSaved: () => void;
};

const EditReportModal: React.FC<EditReportModalProps> = ({
  report,
  onClose,
  onSaved,
}) => {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: updateStatus, isPending } = useUpdateReportStatus();

  useEffect(() => {
    setStatus(report.status);
    setError(null);
  }, [report]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isPending, onClose]);

  const handleSubmit = async () => {
    setError(null);
    if (status === report.status) {
      onClose();
      return;
    }
    try {
      await updateStatus({ reportId: report.id, status });
      onSaved();
      onClose();
    } catch (err) {
      const message = getApiErrorMessage(err, "We couldn't update the report. Please try again.");
      setError(message);
    }
  };

  return (
    <ModalDialog
      aria-labelledby="edit-report-title"
      onClose={() => {
        if (!isPending) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 id="edit-report-title">Edit report</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handlerSubmit(handleSubmit)}>
          <div className={styles.body}>
            <div className={styles.readOnlyBlock}>
              <div className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>Submitted</span>
                <span className={styles.readOnlyValue}>
                  {formatDate(report.createdAt)}
                </span>
              </div>
              <div className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>Reporter</span>
                <span className={styles.readOnlyValue}>
                  {formatUser(report.reporter)}
                </span>
              </div>
              <div className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>Reported user</span>
                <span className={styles.readOnlyValue}>
                  {report.targetUser ? formatUser(report.targetUser) : '-'}
                </span>
              </div>
              <div className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>Reason</span>
                <span className={styles.readOnlyValue}>{report.reason}</span>
              </div>
              {report.details && (
                <div className={styles.detailsBlock}>
                  <span className={styles.readOnlyLabel}>Details</span>
                  <p className={styles.detailsText}>{report.details}</p>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-report-status">Status</label>
              <select
                id="edit-report-status"
                className={styles.select}
                value={status}
                disabled={isPending}
                onChange={(e) => setStatus(e.target.value as ReportStatus)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className={styles.fieldHint}>
                {STATUS_OPTIONS.find((o) => o.value === status)?.hint}
              </p>
            </div>

            {error && <p className={styles.error}>{error}</p>}
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              disabled={isPending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? <Loader2 size={16} className={styles.spinner} /> : null}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
};

export default EditReportModal;
