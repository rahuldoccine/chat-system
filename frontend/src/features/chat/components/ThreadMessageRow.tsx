import React, { useState } from 'react';
import { Smile, MoreHorizontal, Reply } from 'lucide-react';
import type { Message } from '../types';
import type { DecryptedBody } from '../../e2ee/useMessageBodies';
import {
  getMessageDisplayBody,
  getMessageLinkPreview,
  messageWithDecryptedMeta,
} from '../../e2ee/useMessageBodies';
import { isE2eeMessage } from '../../e2ee/directChat';
import { getMessageFiles, shouldUseGroupedFileLayout } from '../utils/fileMeta';
import MediaAttachment from './MediaAttachment';
import UserAvatar from './UserAvatar';
import LiveUserName from './LiveUserName';
import MessageMeta from './MessageMeta';
import LinkPreviewBlock from './LinkPreviewBlock';
import MessageOptionsMenu, { type MessageMenuAction } from './MessageOptionsMenu';
import { getMessageCopyText } from '../utils/messageCache';
import { useAppSettings } from '../../settings/hooks/useUserSettings';
import styles from './ThreadMessageRow.module.css';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type ThreadMessageRowProps = {
  msg: Message;
  isMe: boolean;
  isDirectChat: boolean;
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

  const text = getMessageDisplayBody(msg, bodies, viewerId);
  const preview = getMessageLinkPreview(msg, bodies);
  const displayMsg = messageWithDecryptedMeta(msg, bodies);
  const files = getMessageFiles(displayMsg);
  const hasMedia = Boolean(files?.length);
  const usesGroupedFiles = hasMedia && shouldUseGroupedFileLayout(displayMsg);
  const groupedWithCaption = usesGroupedFiles && Boolean(text?.trim());
  const showCaptionText = Boolean(text?.trim()) && !usesGroupedFiles;
  const shrinkMediaBubble = hasMedia && !usesGroupedFiles;
  const mediaOnly =
    shrinkMediaBubble && !Boolean(text?.trim()) && !groupedWithCaption;
  const hasReactions = Boolean(msg.reactionsSummary?.length);

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
      <div className={`${styles.body} ${shrinkMediaBubble ? styles.bodyMediaFit : ''}`}>
        <div className={styles.header}>
          <LiveUserName
            userId={msg.senderId}
            displayName={msg.sender?.displayName}
            email={msg.sender?.email}
            className={styles.senderName}
          />
        </div>
        <div
          className={`${styles.bubble} ${isMe ? styles.bubbleMe : ''} ${
            hasMedia ? styles.bubbleHasMedia : ''
          } ${shrinkMediaBubble ? styles.bubbleMediaFit : ''}`}
        >
          {showCaptionText ? <p className={styles.text}>{text}</p> : null}
          {preview && !msg.deletedAt && !groupedWithCaption ? (
            <LinkPreviewBlock
              preview={preview}
              displayAs={preview.displayAs}
              variant="message"
              bubbleVariant={isMe ? 'sent' : 'received'}
            />
          ) : null}
          {hasMedia ? (
            <div className={styles.mediaBlock}>
              <MediaAttachment
                kind={displayMsg.kind ?? 'FILE'}
                contentMeta={displayMsg.contentMeta}
                e2eeMessage={isE2eeMessage(msg) ? msg : undefined}
                transportMeta={displayMsg.contentMeta as Record<string, unknown> | undefined}
                embedded
                caption={groupedWithCaption ? text ?? undefined : undefined}
                bubbleVariant={isMe ? 'sent' : 'received'}
                mediaTimestamp={
                  mediaOnly
                    ? {
                        createdAt: msg.createdAt,
                        editedAt: msg.editedAt,
                        isMe,
                        receiptStatus:
                          isMe && isDirectChat && showReceipts && !msg.status
                            ? msg.receiptStatus ?? 'sent'
                            : undefined,
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
          {!text?.trim() && !preview && !hasMedia ? (
            <p className={styles.text}>…</p>
          ) : null}
          {!mediaOnly ? (
            <div className={styles.bubbleFooter}>
              <MessageMeta
                createdAt={msg.createdAt}
                editedAt={msg.editedAt}
                isMe={isMe}
                sendStatus={isMe ? msg.status : undefined}
                receiptStatus={
                  isMe && isDirectChat && showReceipts && !msg.status
                    ? msg.receiptStatus ?? 'sent'
                    : undefined
                }
                inline
              />
            </div>
          ) : null}
        </div>
        {hasReactions && (
          <div className={styles.reactions}>
            {msg.reactionsSummary!.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`${styles.reaction} ${r.byMe ? styles.reactionMine : ''}`}
                onClick={() => onReactionPick(r.emoji)}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

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
        {reactionPickerOpen && (
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
        )}
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
          {optionsOpen && (
            <MessageOptionsMenu
              message={msg}
              isMe={isMe}
              isPinned={isPinned}
              userId={viewerId}
              decryptedBodies={bodies}
              copyText={getMessageCopyText(msg, bodies, viewerId)}
              onAction={(action) => {
                onMenuAction(action);
                setOptionsOpen(false);
              }}
              onClose={() => setOptionsOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreadMessageRow;
