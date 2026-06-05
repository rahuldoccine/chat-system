import React, { useState } from 'react';
import type { Message } from '../types';
import type { DecryptedBody } from '../utils/messageBody';
import {
  getMessageDisplayBody,
  getMessageLinkPreview,
  messageWithDecryptedMeta,
} from '../utils/messageBody';
import { computeThreadMessageLayout } from './threadMessageRowLayout';
import UserAvatar from './UserAvatar';
import { useAppSettings } from '../../settings/hooks/useUserSettings';
import ThreadMessageRowBody from './ThreadMessageRowBody';
import ThreadMessageRowActions from './ThreadMessageRowActions';
import ThreadMessageRowReactions from './ThreadMessageRowReactions';
import type { MessageMenuAction } from './MessageOptionsMenu';
import styles from './ThreadMessageRow.module.css';

export type ThreadMessageRowProps = {
  msg: Message;
  isMe: boolean;
  isDirectChat: boolean;
  canPin?: boolean;
  viewerId?: string;
  bodies: Record<string, DecryptedBody>;
  isPinned?: boolean;
  onReply: () => void;
  onMenuAction: (action: MessageMenuAction) => void;
  onReactionPick: (emoji: string) => void;
};

const ThreadMessageRow: React.FC<ThreadMessageRowProps> = ({
  msg,
  isMe,
  isDirectChat,
  canPin = true,
  viewerId,
  bodies,
  isPinned = false,
  onReply,
  onMenuAction,
  onReactionPick,
}) => {
  const { data: appSettings } = useAppSettings();
  const showReceipts = appSettings?.showReadReceipts !== false;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const text = getMessageDisplayBody(msg, bodies, viewerId ?? '');
  const preview = getMessageLinkPreview(msg, bodies);
  const displayMsg = messageWithDecryptedMeta(msg);
  const layout = computeThreadMessageLayout(displayMsg, text);
  if (msg.deletedAt) {
    return (
      <div className={`${styles.row} ${isMe ? styles.rowMe : ''}`}>
        <p className={styles.text} style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          Message deleted
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${isMe ? styles.rowMe : ''}`}>
      <UserAvatar
        userId={msg.senderId}
        avatarUrl={msg.sender?.avatarUrl}
        displayName={msg.sender?.displayName}
        email={msg.sender?.email}
        className={styles.avatar}
        fallbackFontSize="0.75rem"
      />
      <div className={`${styles.body} ${layout.shrinkMediaBubble ? styles.bodyMediaFit : ''}`}>
        <ThreadMessageRowBody
          msg={msg}
          displayMsg={displayMsg}
          isMe={isMe}
          isDirectChat={isDirectChat}
          showReceipts={showReceipts}
          text={text}
          preview={preview}
          {...layout}
        />
        <ThreadMessageRowReactions msg={msg} onReactionPick={onReactionPick} />
      </div>
      <ThreadMessageRowActions
        msg={msg}
        isMe={isMe}
        canPin={canPin}
        isPinned={isPinned}
        viewerId={viewerId}
        bodies={bodies}
        optionsOpen={optionsOpen}
        reactionPickerOpen={reactionPickerOpen}
        setOptionsOpen={setOptionsOpen}
        setReactionPickerOpen={setReactionPickerOpen}
        onReply={onReply}
        onMenuAction={onMenuAction}
        onReactionPick={onReactionPick}
      />
    </div>
  );
};

export default ThreadMessageRow;
