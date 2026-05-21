import React, { useMemo } from 'react';
import panelStyles from './ChatPanel.module.css';
import styles from './ChatPinsPanel.module.css';
import { Pin, Loader2 } from 'lucide-react';
import { usePinnedMessages } from '../hooks/useChatData';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import { formatChatTimestamp } from '../../../utils/timeFormat';
import {
  getMessageFiles,
  shouldUseGroupedFileLayout,
} from '../utils/fileMeta';
import {
  useMessageBodies,
  messageWithDecryptedMeta,
  getMessageDisplayBody,
  getDecryptedPollMeta,
} from '../../e2ee/useMessageBodies';
import { getMessagePreviewText } from '../utils/messagePreview';
import MediaAttachment from './MediaAttachment';
import PollMessage from './PollMessage';
import type { Message } from '../types';

const ChatPinsPanel: React.FC = () => {
  const { activeId, requestScrollToMessage } = useChat();
  const { user } = useAuth();
  const { data, isLoading, error } = usePinnedMessages(activeId);

  const pins = data?.data ?? [];

  const pinnedMessages = useMemo(
    () => pins.map((p) => p.message).filter((m): m is Message => Boolean(m)),
    [pins],
  );

  const decryptedBodies = useMessageBodies(pinnedMessages);

  const senderLabel = (m: Message) =>
    m.sender?.displayName || m.sender?.email || 'User';

  const handleOpenInChat = (messageId: string) => {
    requestScrollToMessage(messageId);
  };

  if (isLoading) {
    return (
      <div className={panelStyles.panel}>
        <div className={panelStyles.loading}>
          <Loader2 size={20} className={panelStyles.spinner} />
          Loading pins…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={panelStyles.panel}>
        <div className={panelStyles.empty}>
          <p>Pinned messages couldn't be loaded. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={panelStyles.panel}>
      <p className={styles.heading}>Pinned messages</p>

      {pins.length === 0 ? (
        <div className={panelStyles.empty}>
          <div className={panelStyles.emptyIcon}>
            <Pin size={26} />
          </div>
          <h3>No pinned messages</h3>
          <p>Pin important messages from the conversation menu to find them here.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {pins.map((pin) => {
            const m = pin.message;
            if (!m) return null;

            const displayMsg = messageWithDecryptedMeta(m, decryptedBodies);
            const displayBody = getMessageDisplayBody(m, decryptedBodies, user?.id ?? '');
            const isMe = m.senderId === user?.id;
            const isPoll = m.kind === 'POLL' && Boolean(m.contentMeta?.pollId);
            const messageFiles = getMessageFiles(displayMsg);
            const hasMedia = Boolean(messageFiles?.length) && !isPoll;
            const isDecrypting = displayBody === '…';
            const caption = isDecrypting ? '' : displayBody.trim();
            const showCaption = Boolean(caption);
            const showFallback = !hasMedia && !isPoll && !showCaption && !isDecrypting;

            const pinnedAt = formatChatTimestamp(pin.createdAt);
            const pinnedBy =
              pin.pinnedBy?.displayName || pin.pinnedBy?.email || senderLabel(m);

            return (
              <article key={pin.messageId} className={styles.card}>
                <header className={styles.cardHeader}>
                  <span className={styles.avatar}>
                    {senderLabel(m).charAt(0).toUpperCase()}
                  </span>
                  <div className={styles.cardMeta}>
                    <span className={styles.sender}>{senderLabel(m)}</span>
                    <span className={styles.time}>
                      {formatChatTimestamp(m.createdAt)}
                      {isMe ? ' · You' : ''}
                    </span>
                  </div>
                </header>
                <div className={styles.cardBody}>
                  {isDecrypting && (
                    <p className={styles.textMuted}>Decrypting message…</p>
                  )}

                  {isPoll && m.contentMeta?.pollId && (
                    <div className={styles.pollWrap}>
                      <PollMessage
                        pollId={m.contentMeta.pollId}
                        isMe={isMe}
                        decryptedPoll={getDecryptedPollMeta(m, decryptedBodies, user?.id ?? '')}
                      />
                    </div>
                  )}

                  {hasMedia && displayMsg.kind && displayMsg.contentMeta && (
                    <div
                      className={`${styles.mediaWrap} ${
                        shouldUseGroupedFileLayout(displayMsg) ? styles.mediaWrapWide : ''
                      }`}
                    >
                      <MediaAttachment
                        kind={displayMsg.kind}
                        contentMeta={displayMsg.contentMeta}
                        e2eeMessage={m}
                        transportMeta={
                          displayMsg.contentMeta as Record<string, unknown> | undefined
                        }
                        embedded
                        caption={
                          shouldUseGroupedFileLayout(displayMsg) && showCaption
                            ? caption
                            : undefined
                        }
                        bubbleVariant={isMe ? 'sent' : 'received'}
                      />
                    </div>
                  )}

                  {showCaption &&
                    (!hasMedia || !shouldUseGroupedFileLayout(displayMsg)) && (
                      <p className={styles.text}>{caption}</p>
                    )}

                  {showFallback && (
                    <p className={styles.textMuted}>
                      {getMessagePreviewText(m, decryptedBodies, user?.id)}
                    </p>
                  )}
                </div>
                <footer className={styles.cardFooter}>
                  <span className={styles.pinNote}>Pinned by {pinnedBy} · {pinnedAt}</span>
                  <button
                    type="button"
                    className={styles.jumpBtn}
                    onClick={() => handleOpenInChat(m.id)}
                  >
                    View in chat
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChatPinsPanel;
