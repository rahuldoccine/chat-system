import React from 'react';
import { Ban } from 'lucide-react';
import type { BlockStatus } from '../hooks/useBlockStatus';
import styles from './MessagingRestrictedNotice.module.css';

type MessagingRestrictedNoticeProps = {
  peerName: string;
  blockStatus: BlockStatus;
};

const MessagingRestrictedNotice: React.FC<MessagingRestrictedNoticeProps> = ({
  peerName,
  blockStatus,
}) => {
  const { blockedByPeer } = blockStatus;

  const title = blockedByPeer
    ? 'Messaging is restricted'
    : 'You blocked this user';

  const description = blockedByPeer
    ? `${peerName} has blocked you. You can no longer send messages in this conversation.`
    : `You blocked ${peerName}. Unblock them from the menu above to send messages again.`;

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.iconWrap} aria-hidden>
        <Ban size={20} />
      </div>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.description}>{description}</p>
      </div>
    </div>
  );
};

export default MessagingRestrictedNotice;
