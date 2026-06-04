import styles from './MessageStream.module.css';
import MediaAttachment from './MediaAttachment';
import MessageMeta from './MessageMeta';
import PollMessage from './PollMessage';
import LinkPreviewBlock from './LinkPreviewBlock';
import { replyPreviewAuthor, replyPreviewLabel } from '../utils/messageReply';
import { linkDisplayMode } from '../utils/linkPreviewUtils';
import {
  getDecryptedPollMeta,
  getMessageLinkPreview,
} from '../../e2ee/useMessageBodies';
import { HighlightedMessageText, MentionHighlightedText } from '../utils/searchHighlight';
import {
  bodyTextForDisplay,
  getThreadBroadcastLabel,
  shouldRenderBodyText,
} from './messageStreamRow.helpers';
import type { LinkDisplayMode, Message, ReplyPreview } from '../types';
import type { DecryptedBody } from '../../e2ee/useMessageBodies';
import type { MessageKindFlags, MessageMediaLayout } from '../utils/messageStream.helpers';
import { GroupE2eeDecryptRetry } from './GroupE2eeDecryptRetry';

export type MessageStreamRowContentProps = Readonly<{
  msg: Message;
  displayMsg: Message;
  messages: Message[] | undefined;
  decryptedBodies: Record<string, DecryptedBody>;
  userId: string | undefined;
  activeId: string | null;
  isMe: boolean;
  displayBody: string;
  kindFlags: MessageKindFlags;
  layout: MessageMediaLayout;
  linkPreview: ReturnType<typeof getMessageLinkPreview> | null;
  receiptStatus: 'sent' | 'delivered' | 'read' | undefined;
  supportsThreads: boolean;
  searchQuery: string;
  activeSearchMessageId: string | null;
  isLast: boolean;
  onScrollToReplyParent: (reply: ReplyPreview | null | undefined, replyToId?: string | null) => void;
  onOpenThread: (rootId: string) => void;
  onMediaLoad?: () => void;
  onLinkDisplayChange: (
    messageId: string,
    preview: NonNullable<ReturnType<typeof getMessageLinkPreview>>,
    mode: LinkDisplayMode,
    existingMeta: Message['contentMeta'],
  ) => void;
}>;

function MessageBodyText({
  bodyText,
  searchQuery,
  messageId,
  activeSearchMessageId,
}: Readonly<{
  bodyText: string;
  searchQuery: string;
  messageId: string;
  activeSearchMessageId: string | null;
}>) {
  return (
    <p>
      {searchQuery ? (
        <HighlightedMessageText
          text={bodyText}
          query={searchQuery}
          isActiveMessage={messageId === activeSearchMessageId}
          markClassName={styles.searchMark}
          markActiveClassName={styles.searchMarkActive}
        />
      ) : (
        <MentionHighlightedText text={bodyText} mentionClassName={styles.mentionMark} />
      )}
    </p>
  );
}

export function MessageStreamRowContent({
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
}: MessageStreamRowContentProps) {
  const {
    hasMedia,
    hasCaption,
    usesGroupedFiles,
    groupedWithCaption,
    wideMediaLayout,
    compactMediaLayout,
    showMediaTimestamp,
    mediaOnly,
  } = layout;

  const renderLinkPreview = (withCaption: boolean) => {
    if (!linkPreview) return null;
    if (withCaption !== groupedWithCaption) return null;
    return (
      <LinkPreviewBlock
        preview={linkPreview}
        displayAs={linkDisplayMode(linkPreview)}
        bubbleVariant={isMe ? 'sent' : 'received'}
        onDisplayAsChange={(mode) => {
          if (!activeId) return;
          onLinkDisplayChange(msg.id, linkPreview, mode, msg.contentMeta);
        }}
      />
    );
  };

  const bodyText = shouldRenderBodyText(hasCaption, usesGroupedFiles, kindFlags)
    ? bodyTextForDisplay(displayBody, linkPreview ?? null)
    : null;

  return (
    <>
      {msg.threadRootId && msg.broadcastToChannel && supportsThreads && (
        <div className={styles.threadBroadcastHeader}>
          <span>Replied to a thread: </span>
          <button
            type="button"
            className={styles.threadBroadcastLink}
            onClick={(e) => {
              e.stopPropagation();
              if (msg.threadRootId) onOpenThread(msg.threadRootId);
            }}
          >
            {getThreadBroadcastLabel(msg.threadRootId, messages, decryptedBodies, userId)}
          </button>
        </div>
      )}
      {(msg.replyTo || msg.replyToId) && !msg.broadcastToChannel && (
        <button
          type="button"
          className={styles.replyQuote}
          onClick={(e) => {
            e.stopPropagation();
            onScrollToReplyParent(msg.replyTo, msg.replyToId);
          }}
          aria-label={
            msg.replyTo
              ? `View original message from ${replyPreviewAuthor(msg.replyTo, userId)}`
              : 'View original message'
          }
        >
          {msg.replyTo ? (
            <>
              <span className={styles.replyQuoteAuthor}>
                {replyPreviewAuthor(msg.replyTo, userId)}
              </span>
              <span className={styles.replyQuoteText}>
                {replyPreviewLabel(msg.replyTo, decryptedBodies, userId)}
              </span>
            </>
          ) : (
            <span className={styles.replyQuoteText}>View original message</span>
          )}
        </button>
      )}
      {kindFlags.isPoll && msg.contentMeta?.pollId && (
        <div className={styles.pollBlock}>
          <PollMessage
            pollId={msg.contentMeta.pollId}
            isMe={isMe}
            decryptedPoll={getDecryptedPollMeta(msg, decryptedBodies, userId ?? '')}
          />
        </div>
      )}
      {hasMedia && !kindFlags.isPoll && (
        <div
          className={`${styles.mediaBlock} ${wideMediaLayout ? styles.mediaBlockGrouped : ''} ${
            compactMediaLayout ? styles.mediaBlockCompact : ''
          }`}
        >
          <MediaAttachment
            kind={displayMsg.kind ?? 'FILE'}
            contentMeta={displayMsg.contentMeta}
            e2eeMessage={msg}
            transportMeta={displayMsg.contentMeta}
            embedded
            caption={groupedWithCaption ? displayBody : undefined}
            bubbleVariant={isMe ? 'sent' : 'received'}
            onMediaLoad={isLast ? onMediaLoad : undefined}
            mediaTimestamp={
              showMediaTimestamp
                ? {
                    createdAt: msg.createdAt,
                    editedAt: msg.editedAt,
                    isMe,
                    receiptStatus,
                  }
                : undefined
            }
          />
        </div>
      )}
      {renderLinkPreview(true)}
      <div className={styles.bubbleBody}>
        {bodyText ? (
          <MessageBodyText
            bodyText={bodyText}
            searchQuery={searchQuery}
            messageId={msg.id}
            activeSearchMessageId={activeSearchMessageId}
          />
        ) : null}
        <GroupE2eeDecryptRetry msg={msg} displayBody={displayBody} activeId={activeId} />
        {renderLinkPreview(false)}
        {!mediaOnly && (
          <MessageMeta
            createdAt={msg.createdAt}
            editedAt={msg.editedAt}
            isMe={isMe}
            sendStatus={isMe ? msg.status : undefined}
            receiptStatus={receiptStatus}
          />
        )}
      </div>
    </>
  );
}
