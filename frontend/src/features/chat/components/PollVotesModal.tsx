import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PollDetail } from '../types';
import UserAvatar from './UserAvatar';
import LiveUserName from './LiveUserName';
import styles from './PollVotesModal.module.css';

type PollVotesModalProps = {
  open: boolean;
  poll: PollDetail | null;
  onClose: () => void;
};

const PollVotesModal: React.FC<PollVotesModalProps> = ({ open, poll, onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || !poll) return null;

  const totalVotes = poll.totalVotes ?? poll.options.reduce((sum, o) => sum + o.votes, 0);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCloseRef.current();
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-votes-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="poll-votes-title" className={styles.title}>
            Poll votes
          </h2>
          <button type="button" className={styles.closeBtn} onClick={() => onCloseRef.current()} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className={styles.question}>{poll.question}</p>
        <p className={styles.summary}>
          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        </p>
        <div className={styles.sections}>
          {poll.options.map((opt) => (
            <section key={opt.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.optionLabel}>{opt.label}</span>
                <span className={styles.optionCount}>{opt.votes}</span>
              </div>
              {opt.voters && opt.voters.length > 0 ? (
                <ul className={styles.voterList}>
                  {opt.voters.map((voter) => (
                    <li key={voter.id} className={styles.voterRow}>
                      <UserAvatar
                        userId={voter.id}
                        avatarUrl={voter.avatarUrl}
                        displayName={voter.displayName}
                        email={voter.email}
                        className={styles.voterAvatar}
                        fallbackFontSize="0.7rem"
                      />
                      <LiveUserName
                        userId={voter.id}
                        displayName={voter.displayName}
                        email={voter.email}
                        className={styles.voterName}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.noVotes}>No votes yet</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PollVotesModal;
