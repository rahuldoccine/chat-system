import React from 'react';
import { handler } from '../../../utils/asyncHandler';
import { motion } from 'framer-motion';
import { ChevronDown, Pin } from 'lucide-react';
import styles from './MessageStream.module.css';
import UserAvatar from './UserAvatar';
import LiveUserName from './LiveUserName';
import {
  MessageStreamCallSystemRow,
  MessageStreamCallTranscriptRow,
  MessageStreamGroupActivityRow,
} from './messageStreamRowVariants';
import { formatUnreadDividerLabel } from '../utils/messageStreamItems';
import {
  computeMessageMediaLayout,
  formatThreadReplySummary,
  getMessageKindFlags,
} from '../utils/messageStream.helpers';
import {
  getMessageLinkPreview,
  messageWithDecryptedMeta,
} from '../utils/messageBody';
import { buildBubbleClassName, getDirectReadReceiptStatus } from './messageStreamRow.helpers';
import { MessageStreamRowContent } from './MessageStreamRowContent';
import { MessageStreamRowActions } from './MessageStreamRowActions';
import type { LinkDisplayMode, Message, ReplyPreview } from '../types';
import type { DecryptedBody } from '../utils/messageBody';
import type { MessageMenuAction } from './MessageOptionsMenu';

export { QUICK_REACTIONS } from './messageStreamRow.helpers';

type MessageStreamDateDividerProps = Readonly<{
  itemKey: string;
  label: string;
}>;

export function MessageStreamDateDivider({ itemKey, label }: MessageStreamDateDividerProps) {
  return (
    <motion.div
      key={`date-${itemKey}`}
      className={styles.dateDivider}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <span className={styles.dateDividerLine} aria-hidden />
      <span className={styles.dateDividerPill}>
        {label}
        <ChevronDown size={14} className={styles.dateDividerChevron} />
      </span>
      <span className={styles.dateDividerLine} aria-hidden />
    </motion.div>
  );
}

type MessageStreamUnreadDividerProps = Readonly<{
  count: number;
}>;

export function MessageStreamUnreadDivider({ count }: MessageStreamUnreadDividerProps) {
  const label = formatUnreadDividerLabel(count);
  return (
    <div
      id="unread-divider"
      className={styles.unreadDivider}
      role="separator"
      aria-label={label}
    >
      <span className={styles.unreadDividerLine} aria-hidden />
      <span className={styles.unreadDividerPill}>{label}</span>
      <span className={styles.unreadDividerLine} aria-hidden />
    </div>
  );
}

type ActiveChatPeer = {
  id: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
};

export type MessageStreamRowProps = Readonly<{
  msg: Message;
  messages: Message[] | undefined;
  decryptedBodies: Record<string, DecryptedBody>;
  userId: string | undefined;
  activeId: string | null;
  isDirectChat: boolean;
  isGroupChat: boolean;
  supportsThreads: boolean;
  showReadReceipts: boolean;
  memberRoleByUserId: Map<string, string>;
  pinnedIds: Set<string>;
  isLast: boolean;
  isHighlighted: boolean;
  searchQuery: string;
  activeSearchMessageId: string | null;
  activeChat?: {
    type?: string;
    dmPeer?: ActiveChatPeer;
  };
  callPhase: string;
  reactionPickerFor: string | null;
  optionsFor: string | null;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  canModerate: boolean;
  bodyOf: (msg: Message) => string;
  onRetryFailedMessage: (msg: Message) => void;
  onScrollToReplyParent: (reply: ReplyPreview | null | undefined, replyToId?: string | null) => void;
  onOpenThread: (rootId: string) => void;
  onSetReplyingTo: (id: string) => void;
  onReactionPick: (messageId: string, emoji: string) => void;
  onSetReactionPickerFor: React.Dispatch<React.SetStateAction<string | null>>;
  onSetOptionsFor: React.Dispatch<React.SetStateAction<string | null>>;
  onMenuAction: (msg: Message, action: MessageMenuAction) => void;
  onStartCall: (args: {
    chatId: string;
    peerUserId: string;
    peerDisplayName: string;
    video: boolean;
  }) => void;
  onMediaLoad?: () => void;
  onLastMessageSettled?: () => void;
  onLinkDisplayChange: (
    messageId: string,
    preview: NonNullable<ReturnType<typeof getMessageLinkPreview>>,
    mode: LinkDisplayMode,
    existingMeta: Message['contentMeta'],
  ) => void;
}>;

const MessageStreamRow: React.FC<MessageStreamRowProps> = (props) => {
  const {
    msg,
    messages,
    decryptedBodies,
    userId,
    activeId,
    isDirectChat,
    isGroupChat,
    supportsThreads,
    showReadReceipts,
    memberRoleByUserId,
    pinnedIds,
    isLast,
    isHighlighted,
    searchQuery,
    activeSearchMessageId,
    activeChat,
    callPhase,
    reactionPickerFor,
    optionsFor,
    reactionPickerRef,
    canModerate,
    bodyOf,
    onRetryFailedMessage,
    onScrollToReplyParent,
    onOpenThread,
    onSetReplyingTo,
    onReactionPick,
    onSetReactionPickerFor,
    onSetOptionsFor,
    onMenuAction,
    onStartCall,
    onMediaLoad,
    onLastMessageSettled,
    onLinkDisplayChange,
  } = props;

  const displayMsg = messageWithDecryptedMeta(msg);
  const isMe = msg.senderId === userId;
  const displayBody = bodyOf(msg);
  const kindFlags = getMessageKindFlags(msg);
  const layout = computeMessageMediaLayout(displayMsg, displayBody);
  const { hasMedia, hasCaption, usesGroupedFiles, groupedWithCaption, singleGroupedFile, wideMediaLayout, compactMediaLayout, isVoiceNote, mediaOnly } = layout;

  const hasReactions = Boolean(msg.reactionsSummary && msg.reactionsSummary.length > 0);
  const isPinned = pinnedIds.has(msg.id);
  const linkPreview = msg.deletedAt ? null : getMessageLinkPreview(msg, decryptedBodies) ?? null;
  const isFailed = isMe && msg.status === 'error';

  if (kindFlags.isGroupActivity) {
    return <MessageStreamGroupActivityRow msg={msg} />;
  }

  if (kindFlags.isCallTranscript && kindFlags.transcriptMeta) {
    return <MessageStreamCallTranscriptRow msg={msg} transcriptMeta={kindFlags.transcriptMeta} />;
  }

  if (kindFlags.isCallSystem && kindFlags.callMeta && userId) {
    return (
      <MessageStreamCallSystemRow
        msg={msg}
        callMeta={kindFlags.callMeta}
        isMe={isMe}
        userId={userId}
        isDirectChat={isDirectChat}
        callPhase={callPhase}
        activeId={activeId}
        peer={activeChat?.dmPeer}
        onStartCall={onStartCall}
      />
    );
  }

  const receiptStatus = getDirectReadReceiptStatus(isMe, isDirectChat, showReadReceipts, msg);

  const bubbleClassOpts = {
    isPinned,
    isPoll: kindFlags.isPoll,
    hasMedia,
    mediaOnly,
    groupedWithCaption,
    singleGroupedFile,
    usesGroupedFiles,
    hasCaption,
    isVoiceNote,
    isFailed,
  };
  const bubbleClassName = buildBubbleClassName(styles, bubbleClassOpts);
  const rowContentProps = {
    msg,
    displayMsg,
    messages,
    decryptedBodies,
    userId,
    activeId,
    isMe,
    displayBody,
    kindFlags,
    layout,
    linkPreview,
    receiptStatus,
    supportsThreads,
    searchQuery,
    activeSearchMessageId,
    isLast,
    onScrollToReplyParent,
    onOpenThread,
    onMediaLoad,
    onLinkDisplayChange,
  };
  const bubbleInner = <MessageStreamRowContent {...rowContentProps} />;

  return (
    <motion.div
      key={msg.id}
      id={`msg-${msg.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onAnimationComplete={isLast ? onLastMessageSettled : undefined}
      className={`${styles.messageWrapper} ${isMe ? styles.isMe : ''} ${
        wideMediaLayout ? styles.messageWrapperWithMedia : ''
      } ${compactMediaLayout ? styles.messageWrapperMediaCompact : ''}`}
    >
      {!isMe && (
        <UserAvatar
          userId={msg.senderId}
          avatarUrl={msg.sender?.avatarUrl}
          displayName={msg.sender?.displayName}
          email={msg.sender?.email}
          className={styles.avatar}
          fallbackFontSize="0.9rem"
        />
      )}

      <div className={styles.bubbleContent}>
        {isPinned && (
          <span className={styles.pinnedBadge} aria-label="Pinned message">
            <Pin size={11} strokeWidth={2.5} aria-hidden />
            Pinned
          </span>
        )}
        {!isMe && (
          <div className={styles.senderNameRow}>
            <LiveUserName
              userId={msg.senderId}
              displayName={msg.sender?.displayName}
              email={msg.sender?.email}
              className={styles.senderName}
            />
            {isGroupChat && memberRoleByUserId.get(msg.senderId) && (
              <span className={styles.roleBadge}>{memberRoleByUserId.get(msg.senderId)}</span>
            )}
          </div>
        )}

        <div className={styles.bubbleContainer}>
          <div
            className={`${styles.bubbleWrap} ${hasReactions ? styles.bubbleWrapWithReactions : ''} ${
              isHighlighted ? styles.messageHighlight : ''
            }`}
          >
            {isFailed ? (
              <button
                type="button"
                title="Tap to retry sending"
                onClick={handler(() => onRetryFailedMessage(msg))}
                className={bubbleClassName}
              >
                {bubbleInner}
              </button>
            ) : (
              <div className={bubbleClassName}>{bubbleInner}</div>
            )}
            {(msg.threadReplyCount ?? 0) > 0 && !msg.threadRootId && supportsThreads && (
              <button type="button" className={styles.threadSummary} onClick={() => onOpenThread(msg.id)}>
                {formatThreadReplySummary(msg.threadReplyCount ?? 0, msg.threadLastReplyAt)}
              </button>
            )}
            <MessageStreamRowActions
              msg={msg}
              isMe={isMe}
              supportsThreads={supportsThreads}
              isDirectChat={isDirectChat}
              canModerate={canModerate}
              userId={userId}
              pinnedIds={pinnedIds}
              decryptedBodies={decryptedBodies}
              reactionPickerFor={reactionPickerFor}
              optionsFor={optionsFor}
              reactionPickerRef={reactionPickerRef}
              onReactionPick={onReactionPick}
              onSetReactionPickerFor={onSetReactionPickerFor}
              onSetOptionsFor={onSetOptionsFor}
              onSetReplyingTo={onSetReplyingTo}
              onOpenThread={onOpenThread}
              onMenuAction={onMenuAction}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MessageStreamRow;
