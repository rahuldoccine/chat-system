import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useReportUser, getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './ReportUserModal.module.css';
import { handlerSubmit } from '../../../utils/asyncHandler';

const REASONS = ['Spam', 'Harassment', 'Other'] as const;
type ReasonOption = (typeof REASONS)[number];

type ReportUserModalProps = {
  targetUserId: string;
  chatId: string;
  peerName: string;
  onClose: () => void;
};

const ReportUserModal: React.FC<ReportUserModalProps> = ({
  targetUserId,
  chatId,
  peerName,
  onClose,
}) => {
  const [reason, setReason] = useState<ReasonOption>('Spam');
  const [otherReason, setOtherReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: reportUser, isPending } = useReportUser();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isPending, onClose]);

  const resolvedReason = reason === 'Other' ? otherReason.trim() : reason;

  const handleSubmit = async () => {
    setError(null);
    if (!resolvedReason) {
      setError('Please enter a reason');
      return;
    }
    if (resolvedReason.length > 80) {
      setError('Reason must be 80 characters or less');
      return;
    }
    try {
      await reportUser({
        targetUserId,
        chatId,
        reason: resolvedReason,
        details: details.trim() || undefined,
      });
      toast.success('Report submitted');
      onClose();
    } catch (err) {
      const message = getApiErrorMessage(err, "We couldn't send your report. Please try again.");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <ModalDialog
      aria-labelledby="report-modal-title"
      onClose={() => {
        if (!isPending) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 id="report-modal-title">Report {peerName}</h3>
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
            <div className={styles.field}>
              <label htmlFor="report-reason">Reason</label>
              <select
                id="report-reason"
                className={styles.select}
                value={reason}
                disabled={isPending}
                onChange={(e) => setReason(e.target.value as ReasonOption)}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {reason === 'Other' && (
              <div className={styles.field}>
                <label htmlFor="report-other">Describe the issue</label>
                <input
                  id="report-other"
                  className={styles.input}
                  maxLength={80}
                  value={otherReason}
                  disabled={isPending}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="Required for Other"
                />
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor="report-details">Details (optional)</label>
              <textarea
                id="report-details"
                className={styles.textarea}
                maxLength={4000}
                value={details}
                disabled={isPending}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Additional context..."
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} disabled={isPending} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? <Loader2 size={16} /> : null}
              Submit report
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
};

export default ReportUserModal;
