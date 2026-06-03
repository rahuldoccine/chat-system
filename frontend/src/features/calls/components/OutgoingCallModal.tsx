import React from 'react';
import { createPortal } from 'react-dom';
import { PhoneOff } from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './OutgoingCallModal.module.css';

type OutgoingCallModalProps = {
  peerName: string;
  peerUserId?: string;
  peerAvatarUrl?: string | null;
  statusLabel: string;
  onCancel: () => void;
};

const OutgoingCallModal: React.FC<OutgoingCallModalProps> = ({
  peerName,
  peerUserId,
  peerAvatarUrl,
  statusLabel,
  onCancel,
}) => {
  return createPortal(
    <dialog className={styles.backdrop} open aria-label="Outgoing call">
      <div className={styles.card}>
        <h2 className={styles.title}>{peerName}</h2>
        <p className={styles.status}>{statusLabel}</p>
        <div className={styles.avatarWrap}>
          <UserAvatar
            userId={peerUserId}
            avatarUrl={peerAvatarUrl}
            displayName={peerName}
            className={styles.avatar}
            fallbackFontSize="2.75rem"
          />
        </div>
        <button
          type="button"
          className={styles.endBtn}
          onClick={onCancel}
          aria-label="Cancel call"
          title="Cancel call"
        >
          <PhoneOff size={26} strokeWidth={2.25} />
        </button>
      </div>
    </dialog>,
    document.body,
  );
};

export default OutgoingCallModal;
