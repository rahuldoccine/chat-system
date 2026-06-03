import React from 'react';
import { MoreHorizontal, Reply, Smile } from 'lucide-react';
import styles from './MessageStream.module.css';
import MessageOptionsMenu, { type MessageMenuAction } from './MessageOptionsMenu';
import { getMessageCopyText } from '../utils/messageCache';
import { QUICK_REACTIONS } from './messageStreamRow.helpers';
import type { Message } from '../types';
import type { DecryptedBody } from '../../e2ee/useMessageBodies';

export type MessageStreamRowActionsProps = Readonly<{
  msg: Message;
  isMe: boolean;
  supportsThreads: boolean;
  isDirectChat: boolean;
  canModerate: boolean;
  userId: string | undefined;
  pinnedIds: Set<string>;
  decryptedBodies: Record<string, DecryptedBody>;
  reactionPickerFor: string | null;
  optionsFor: string | null;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  onReactionPick: (messageId: string, emoji: string) => void;
  onSetReactionPickerFor: React.Dispatch<React.SetStateAction<string | null>>;
  onSetOptionsFor: React.Dispatch<React.SetStateAction<string | null>>;
  onSetReplyingTo: (id: string) => void;
  onOpenThread: (rootId: string) => void;
  onMenuAction: (msg: Message, action: MessageMenuAction) => void;
}>;

export function MessageStreamRowActions({
  msg,
  isMe,
  supportsThreads,
  isDirectChat,
  canModerate,
  userId,
  pinnedIds,
  decryptedBodies,
  reactionPickerFor,
  optionsFor,
  reactionPickerRef,
  onReactionPick,
  onSetReactionPickerFor,
  onSetOptionsFor,
  onSetReplyingTo,
  onOpenThread,
  onMenuAction,
}: MessageStreamRowActionsProps) {
  const hasReactions = Boolean(msg.reactionsSummary && msg.reactionsSummary.length > 0);
  const isOptionsOpen = optionsFor === msg.id;
  const isReactionPickerOpen = reactionPickerFor === msg.id;

  const handleReplyClick = () => {
    if (supportsThreads) {
      const rootId =
        msg.threadRootId && msg.broadcastToChannel ? msg.threadRootId : msg.id;
      onOpenThread(rootId);
    } else {
      onSetReplyingTo(msg.id);
    }
  };

  return (
    <>
      {hasReactions && (
        <div className={styles.reactionsOnBubble}>
          {(msg.reactionsSummary ?? []).map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`${styles.reaction} ${r.byMe ? styles.reactionMine : ''}`}
              onClick={() => onReactionPick(msg.id, r.emoji)}
            >
              <span className={styles.reactionEmoji}>{r.emoji}</span>
              <span className={styles.reactionCount}>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={`${styles.actions} ${isMe ? styles.actionsMe : ''} ${
          isOptionsOpen || isReactionPickerOpen ? styles.actionsPinned : ''
        }`}
        ref={
          reactionPickerFor === msg.id || optionsFor === msg.id
            ? reactionPickerRef
            : undefined
        }
      >
        <button
          type="button"
          className={styles.actionBtn}
          aria-label="Add reaction"
          onClick={(e) => {
            e.stopPropagation();
            onSetReactionPickerFor((cur) => (cur === msg.id ? null : msg.id));
          }}
        >
          <Smile size={16} />
        </button>
        {reactionPickerFor === msg.id && (
          <div className={styles.reactionPicker}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.reactionPickBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onReactionPick(msg.id, emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          aria-label={supportsThreads ? 'Reply in thread' : 'Reply'}
          onClick={handleReplyClick}
        >
          <Reply size={16} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          aria-label="More options"
          onClick={(e) => {
            e.stopPropagation();
            onSetReactionPickerFor(null);
            onSetOptionsFor((cur) => (cur === msg.id ? null : msg.id));
          }}
        >
          <MoreHorizontal size={16} />
        </button>
        {optionsFor === msg.id && (
          <MessageOptionsMenu
            message={msg}
            isMe={isMe}
            isPinned={pinnedIds.has(msg.id)}
            canPin={isDirectChat || canModerate}
            userId={userId}
            canModerateDelete={canModerate && !isMe}
            decryptedBodies={decryptedBodies}
            copyText={getMessageCopyText(msg, decryptedBodies, userId)}
            onAction={(action) => onMenuAction(msg, action)}
            onClose={() => onSetOptionsFor(null)}
          />
        )}
      </div>
    </>
  );
}
