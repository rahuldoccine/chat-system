import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ModalDialog } from '../../../components/ModalDialog';
import type { PollDetail } from '../types';
import UserAvatar from './UserAvatar';
import LiveUserName from './LiveUserName';
import { useViewerModalLock } from '../hooks/useViewerModalLock';
import styles from './PollVotesModal.module.css';

type PollVotesModalProps = {
  open: boolean;
  poll: PollDetail | null;
  onClose: () => void;
};

const PollVotesModal: React.FC<PollVotesModalProps> = ({ open, poll, onClose }) => {
  useViewerModalLock(open && Boolean(poll), onClose);

  if (!open || !poll) return null;

  const totalVotes = poll.totalVotes ?? poll.options.reduce((sum, o) => sum + o.votes, 0);

  return createPortal(
    <ModalDialog
      className={styles.overlay}
      aria-labelledby="poll-votes-title"
      onClose={onClose}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="poll-votes-title" className={styles.title}>
            Poll votes
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
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
    </ModalDialog>,
    document.body,
  );
};

export default PollVotesModal;
