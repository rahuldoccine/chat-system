import React from 'react';
import { Smile, MoreHorizontal, Reply } from 'lucide-react';
import type { Message } from '../types';
import type { DecryptedBody } from '../../e2ee/useMessageBodies';
import MessageOptionsMenu, { type MessageMenuAction } from './MessageOptionsMenu';
import { getMessageCopyText } from '../utils/messageCache';
import styles from './ThreadMessageRow.module.css';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type ThreadMessageRowActionsProps = {
  msg: Message;
  isMe: boolean;
  canPin: boolean;
  isPinned: boolean;
  viewerId?: string;
  bodies: Record<string, DecryptedBody>;
  optionsOpen: boolean;
  reactionPickerOpen: boolean;
  setOptionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReactionPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onReply: () => void;
  onMenuAction: (action: MessageMenuAction) => void;
  onReactionPick: (emoji: string) => void;
};

const ThreadMessageRowActions: React.FC<ThreadMessageRowActionsProps> = ({
  msg,
  isMe,
  canPin,
  isPinned,
  viewerId,
  bodies,
  optionsOpen,
  reactionPickerOpen,
  setOptionsOpen,
  setReactionPickerOpen,
  onReply,
  onMenuAction,
  onReactionPick,
}) => (
    <div
      className={`${styles.actions} ${optionsOpen || reactionPickerOpen ? styles.actionsPinned : ''}`}
    >
      <button
        type="button"
        className={styles.actionBtn}
        aria-label="Add reaction"
        onClick={() => {
          setOptionsOpen(false);
          setReactionPickerOpen((v) => !v);
        }}
      >
        <Smile size={15} />
      </button>
      {reactionPickerOpen ? (
        <div className={styles.reactionPicker}>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactionPickBtn}
              onClick={() => {
                onReactionPick(emoji);
                setReactionPickerOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className={styles.actionBtn} aria-label="Reply" onClick={onReply}>
        <Reply size={15} />
      </button>
      <div className={styles.menuWrap}>
        <button
          type="button"
          className={styles.actionBtn}
          aria-label="More options"
          onClick={() => {
            setReactionPickerOpen(false);
            setOptionsOpen((v) => !v);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
        {optionsOpen ? (
          <MessageOptionsMenu
            message={msg}
            isMe={isMe}
            isPinned={isPinned}
            canPin={canPin}
            userId={viewerId}
            decryptedBodies={bodies}
            copyText={getMessageCopyText(msg, bodies, viewerId)}
            onAction={(action) => {
              onMenuAction(action);
              setOptionsOpen(false);
            }}
            onClose={() => setOptionsOpen(false)}
          />
        ) : null}
      </div>
    </div>
);

export default ThreadMessageRowActions;
