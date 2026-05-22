import React, { useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import { useThreadMessages } from '../hooks/useChatData';
import { useMessageBodies } from '../../e2ee/useMessageBodies';
import { getMessagePreviewText } from '../utils/messagePreview';
import type { Message } from '../types';
import UserAvatar from './UserAvatar';
import MessageComposer from './MessageComposer';
import styles from './ThreadPanel.module.css';
import streamStyles from './MessageStream.module.css';

const ThreadPanel: React.FC = () => {
  const { activeId, activeThreadRootId, closeThread } = useChat();
  const { user } = useAuth();
  const { data, isLoading, isError } = useThreadMessages(activeId, activeThreadRootId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allMessages = React.useMemo(() => {
    if (!data?.root) return [];
    return [data.root, ...(data.replies ?? [])];
  }, [data]);

  const decryptedBodies = useMessageBodies(allMessages);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.replies?.length, activeThreadRootId]);

  if (!activeId || !activeThreadRootId) return null;

  return (
    <aside className={styles.panel} aria-label="Thread">
      <div className={styles.header}>
        <span className={styles.title}>Thread</span>
        <button type="button" className={styles.closeBtn} onClick={closeThread} aria-label="Close thread">
          <X size={18} />
        </button>
      </div>

      <div className={styles.scrollArea} ref={scrollRef}>
        <div className={styles.scrollInner}>
          {isLoading && (
            <div className={styles.loading}>
              <Loader2 className={streamStyles.spinner} size={20} />
            </div>
          )}
          {isError && (
            <p className={styles.loading}>Could not load thread replies.</p>
          )}
          {data?.root && (
            <div className={styles.rootBlock}>
              <ThreadMessageBubble
                msg={data.root}
                isMe={data.root.senderId === user?.id}
                bodies={decryptedBodies}
                viewerId={user?.id}
              />
            </div>
          )}
          {(data?.replies?.length ?? 0) > 0 && (
            <>
              <p className={styles.replyCount}>
                {data!.replies.length} {data!.replies.length === 1 ? 'reply' : 'replies'}
              </p>
              <div className={styles.repliesBlock}>
                {data!.replies.map((msg) => (
                  <ThreadMessageBubble
                    key={msg.id}
                    msg={msg}
                    isMe={msg.senderId === user?.id}
                    bodies={decryptedBodies}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <MessageComposer variant="thread" threadRootId={activeThreadRootId} />
      </div>
    </aside>
  );
};

function ThreadMessageBubble({
  msg,
  isMe,
  bodies,
  viewerId,
}: {
  msg: Message;
  isMe: boolean;
  bodies: ReturnType<typeof useMessageBodies>;
  viewerId?: string;
}) {
  const text = getMessagePreviewText(msg, bodies, viewerId);
  return (
    <div className={`${styles.messageRow} ${isMe ? styles.messageRowMe : ''}`}>
      {!isMe && (
        <UserAvatar
          userId={msg.senderId}
          displayName={msg.sender?.displayName}
          email={msg.sender?.email}
          className={streamStyles.avatar}
        />
      )}
      <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : ''}`}>{text || '…'}</div>
    </div>
  );
}

export default ThreadPanel;
