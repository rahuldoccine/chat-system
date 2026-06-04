import React from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Video } from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './IncomingCallModal.module.css';

type IncomingCallModalProps = {
  peerName: string;
  peerUserId?: string;
  peerAvatarUrl?: string | null;
  isVideo: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  peerName,
  peerUserId,
  peerAvatarUrl,
  isVideo,
  onAccept,
  onDecline,
}) =>
  createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Incoming call">
      <div className={styles.card}>
        <h2 className={styles.title}>{peerName}</h2>
        <p className={styles.sub}>
          Incoming {isVideo ? 'video' : 'voice'} call…
        </p>
        <div className={styles.avatarWrap}>
          <UserAvatar
            userId={peerUserId}
            avatarUrl={peerAvatarUrl}
            displayName={peerName}
            className={styles.avatar}
            fallbackFontSize="2.75rem"
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.declineBtn} onClick={onDecline}>
            <PhoneOff size={20} strokeWidth={2.25} />
            Decline
          </button>
          <button type="button" className={styles.acceptBtn} onClick={onAccept}>
            {isVideo ? <Video size={20} strokeWidth={2.25} /> : <Phone size={20} strokeWidth={2.25} />}
            Accept
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

export default IncomingCallModal;
