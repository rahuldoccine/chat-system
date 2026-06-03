import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Chat } from '../types';
import { formatLastSeen } from '../../../utils/timeFormat';
import { isChatMuted, muteUntilIndefinite } from '../utils/mute';
import { useMuteChat, getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import UserAvatar from './UserAvatar';
import a11yStyles from '../../../styles/a11y.module.css';
import styles from './ChatDetailsPanel.module.css';
import { handler } from '../../../utils/asyncHandler';
import GroupInfoPanel from './GroupInfoPanel';

type ChatDetailsPanelProps = {
  chat: Chat;
  chatName: string;
  isPeerOnline: boolean;
  onGroupLeave?: () => void;
};

const ChatDetailsPanel: React.FC<ChatDetailsPanelProps> = ({
  chat,
  chatName,
  isPeerOnline,
  onGroupLeave,
}) => {
  const [muted, setMuted] = useState(() => isChatMuted(chat.mutedUntil));
  const { mutateAsync: muteChat, isPending: muting } = useMuteChat();

  useEffect(() => {
    setMuted(isChatMuted(chat.mutedUntil));
  }, [chat.id, chat.mutedUntil]);

  let statusLabel = 'Group Chat';
  if (chat.type === 'DIRECT') {
    if (isPeerOnline) {
      statusLabel = 'Online';
    } else if (chat.dmPeer?.lastSeenAt) {
      statusLabel = `Last seen ${formatLastSeen(chat.dmPeer.lastSeenAt)}`;
    } else {
      statusLabel = 'Offline';
    }
  }

  const statusClass =
    chat.type === 'DIRECT' && isPeerOnline ? styles.status : `${styles.status} ${styles.statusMuted}`;

  if (chat.type === 'GROUP') {
    return <GroupInfoPanel chat={chat} chatName={chatName} onLeave={onGroupLeave} />;
  }

  const handleMuteToggle = async () => {
    const nextMuted = !muted;
    try {
      await muteChat({
        chatId: chat.id,
        mutedUntil: nextMuted ? muteUntilIndefinite() : null,
      });
      setMuted(nextMuted);
      toast.success(nextMuted ? 'Notifications muted' : 'Notifications unmuted');
    } catch (err) {
      toast.error(getApiErrorMessage(err, "We couldn't update notification settings. Please try again."));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <UserAvatar
          userId={chat.type === 'DIRECT' ? chat.dmPeer?.id : undefined}
          avatarUrl={chat.type === 'DIRECT' ? chat.dmPeer?.avatarUrl : undefined}
          displayName={chat.type === 'DIRECT' ? chat.dmPeer?.displayName : chatName}
          email={chat.dmPeer?.email}
          className={styles.avatar}
          fallbackFontSize="2.5rem"
        />
        <h3 className={styles.name}>{chatName}</h3>
        <p className={statusClass}>{statusLabel}</p>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Information</h4>
        <div className={styles.infoList}>
          {chat.type === 'DIRECT' && chat.dmPeer?.email && (
            <div>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{chat.dmPeer.email}</span>
            </div>
          )}
          {chat.dmPeer?.username && (
            <div>
              <span className={styles.infoLabel}>Username</span>
              <span className={styles.infoValue}>@{chat.dmPeer.username}</span>
            </div>
          )}
        </div>

        <div className={styles.muteRow}>
          <div>
            <div className={styles.muteLabel}>Mute notifications</div>
            <div className={styles.muteHint}>Stop alerts for this chat</div>
          </div>
          <label className={styles.toggle}>
            <span className={a11yStyles.srOnly}>Mute notifications</span>
            <input
              type="checkbox"
              checked={muted}
              disabled={muting}
              onChange={handler(handleMuteToggle)}
              aria-label="Mute notifications"
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

    </div>
  );
};

export default ChatDetailsPanel;
