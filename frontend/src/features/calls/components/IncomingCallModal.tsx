import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
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
    <Dialog.Root open onOpenChange={(open) => !open && onDecline()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content className={styles.card} aria-label="Incoming call">
          <UserAvatar
            userId={peerUserId}
            avatarUrl={peerAvatarUrl}
            displayName={peerName}
            className={styles.avatar}
            fallbackFontSize="2rem"
          />
          <Dialog.Title className={styles.title}>{peerName}</Dialog.Title>
          <Dialog.Description className={styles.sub}>
            Incoming {isVideo ? 'video' : 'voice'} call…
          </Dialog.Description>
          <div className={styles.actions}>
            <button type="button" className={styles.declineBtn} onClick={onDecline}>
              <PhoneOff size={18} />
              Decline
            </button>
            <button type="button" className={styles.acceptBtn} onClick={onAccept}>
              {isVideo ? <Video size={18} /> : <Phone size={18} />}
              Accept
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>,
    document.body,
  );

export default IncomingCallModal;
