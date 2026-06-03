import React from 'react';
import type { Message, LinkPreviewMeta } from '../types';
import { isE2eeMessage } from '../../e2ee/directChat';
import MediaAttachment from './MediaAttachment';
import LiveUserName from './LiveUserName';
import MessageMeta from './MessageMeta';
import LinkPreviewBlock from './LinkPreviewBlock';
import styles from './ThreadMessageRow.module.css';
import { getDirectReadReceiptStatus } from './messageStreamRow.helpers';

export type ThreadMessageRowBodyProps = {
  msg: Message;
  displayMsg: Message;
  isMe: boolean;
  isDirectChat: boolean;
  showReceipts: boolean;
  text: string;
  preview: LinkPreviewMeta | undefined;
  hasMedia: boolean;
  groupedWithCaption: boolean;
  showCaptionText: boolean;
  shrinkMediaBubble: boolean;
  mediaOnly: boolean;
};

function buildThreadBubbleClassName(
  isMe: boolean,
  hasMedia: boolean,
  shrinkMediaBubble: boolean,
): string {
  return [
    styles.bubble,
    isMe ? styles.bubbleMe : '',
    hasMedia ? styles.bubbleHasMedia : '',
    shrinkMediaBubble ? styles.bubbleMediaFit : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function ThreadMessageHeader({ msg }: Readonly<{ msg: Message }>) {
  return (
    <div className={styles.header}>
      <LiveUserName
        userId={msg.senderId}
        displayName={msg.sender?.displayName}
        email={msg.sender?.email}
        className={styles.senderName}
      />
    </div>
  );
}

type ThreadBubbleCaptionProps = Readonly<{
  showCaptionText: boolean;
  text: string;
  preview: LinkPreviewMeta | undefined;
  groupedWithCaption: boolean;
  isMe: boolean;
}>;

function ThreadBubbleCaption({
  showCaptionText,
  text,
  preview,
  groupedWithCaption,
  isMe,
}: ThreadBubbleCaptionProps) {
  return (
    <>
      {showCaptionText ? <p className={styles.text}>{text}</p> : null}
      {preview && !groupedWithCaption ? (
        <LinkPreviewBlock
          preview={preview}
          displayAs={preview.displayAs}
          variant="message"
          bubbleVariant={isMe ? 'sent' : 'received'}
        />
      ) : null}
    </>
  );
}

type ThreadBubbleMediaProps = Readonly<{
  msg: Message;
  displayMsg: Message;
  hasMedia: boolean;
  groupedWithCaption: boolean;
  text: string;
  isMe: boolean;
  mediaOnly: boolean;
  receiptForMedia: 'sent' | 'delivered' | 'read' | undefined;
}>;

function ThreadBubbleMedia({
  msg,
  displayMsg,
  hasMedia,
  groupedWithCaption,
  text,
  isMe,
  mediaOnly,
  receiptForMedia,
}: ThreadBubbleMediaProps) {
  if (!hasMedia) return null;
  return (
    <div className={styles.mediaBlock}>
      <MediaAttachment
        kind={displayMsg.kind ?? 'FILE'}
        contentMeta={displayMsg.contentMeta}
        e2eeMessage={isE2eeMessage(msg) ? msg : undefined}
        transportMeta={displayMsg.contentMeta}
        embedded
        caption={groupedWithCaption ? text || undefined : undefined}
        bubbleVariant={isMe ? 'sent' : 'received'}
        mediaTimestamp={
          mediaOnly
            ? {
                createdAt: msg.createdAt,
                editedAt: msg.editedAt,
                isMe,
                receiptStatus: receiptForMedia,
              }
            : undefined
        }
      />
    </div>
  );
}

function ThreadBubbleEmptyFallback({
  text,
  preview,
  hasMedia,
}: Readonly<{
  text: string;
  preview: LinkPreviewMeta | undefined;
  hasMedia: boolean;
}>) {
  if (text?.trim() || preview || hasMedia) return null;
  return <p className={styles.text}>…</p>;
}

type ThreadBubbleFooterProps = Readonly<{
  mediaOnly: boolean;
  msg: Message;
  isMe: boolean;
  receiptStatus: 'sent' | 'delivered' | 'read' | undefined;
}>;

function ThreadBubbleFooter({ mediaOnly, msg, isMe, receiptStatus }: ThreadBubbleFooterProps) {
  if (mediaOnly) return null;
  return (
    <div className={styles.bubbleFooter}>
      <MessageMeta
        createdAt={msg.createdAt}
        editedAt={msg.editedAt}
        isMe={isMe}
        sendStatus={isMe ? msg.status : undefined}
        receiptStatus={receiptStatus}
        inline
      />
    </div>
  );
}

const ThreadMessageRowBody: React.FC<ThreadMessageRowBodyProps> = (props) => {
  const {
    msg,
    displayMsg,
    isMe,
    isDirectChat,
    showReceipts,
    text,
    preview,
    hasMedia,
    groupedWithCaption,
    showCaptionText,
    shrinkMediaBubble,
    mediaOnly,
  } = props;

  const receiptStatus = getDirectReadReceiptStatus(isMe, isDirectChat, showReceipts, msg);

  return (
    <>
      <ThreadMessageHeader msg={msg} />
      <div className={buildThreadBubbleClassName(isMe, hasMedia, shrinkMediaBubble)}>
        <ThreadBubbleCaption
          showCaptionText={showCaptionText}
          text={text}
          preview={preview}
          groupedWithCaption={groupedWithCaption}
          isMe={isMe}
        />
        <ThreadBubbleMedia
          msg={msg}
          displayMsg={displayMsg}
          hasMedia={hasMedia}
          groupedWithCaption={groupedWithCaption}
          text={text}
          isMe={isMe}
          mediaOnly={mediaOnly}
          receiptForMedia={receiptStatus}
        />
        <ThreadBubbleEmptyFallback text={text} preview={preview} hasMedia={hasMedia} />
        <ThreadBubbleFooter
          mediaOnly={mediaOnly}
          msg={msg}
          isMe={isMe}
          receiptStatus={receiptStatus}
        />
      </div>
    </>
  );
};

export default ThreadMessageRowBody;
