import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useMessageBodies } from '../utils/messageBody';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './ForwardMessageModal.module.css';
import { X, Forward, Loader2 } from 'lucide-react';
import { useConversations, useSendMessage } from '../hooks/useChatData';
import { useChat } from '../../../context/ChatContext';
import type { Message } from '../types';
import { getMessageCopyText } from '../utils/messageCache';
import { buildForwardSendPayload } from '../utils/forwardMessage';

type ForwardMessageModalProps = {
  message: Message;
  fromChatId: string;
  onClose: () => void;
};

const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  message,
  fromChatId,
  onClose,
}) => {
  const { user } = useAuth();
  const { setActiveId, scrollToBottom } = useChat();
  const { data: response, isLoading } = useConversations();
  const decryptedBodies = useMessageBodies([message]);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chats = (
    (
      response as {
        data?: Array<{
          id: string;
          type: string;
          title?: string;
          dmPeer?: { id: string; displayName?: string; email?: string };
        }>;
      }
    )?.data ?? []
  ).filter((c) => c.id !== fromChatId);

  const getChatName = (chat: (typeof chats)[0]) => {
    if (chat.type === 'GROUP') return chat.title || 'Group';
    return chat.dmPeer?.displayName || chat.dmPeer?.email || 'User';
  };

  const preview = getMessageCopyText(message, decryptedBodies, user?.id);

  const renderChatList = () => {
    if (isLoading) {
      return (
        <div className={styles.loading}>
          <Loader2 size={20} className={styles.spinner} />
        </div>
      );
    }
    if (chats.length === 0) {
      return <p className={styles.empty}>No other conversations available.</p>;
    }
    return chats.map((chat) => (
      <button
        key={chat.id}
        type="button"
        className={`${styles.chatItem} ${selectedId === chat.id ? styles.selected : ''}`}
        onClick={() => setSelectedId(chat.id)}
      >
        <span className={styles.chatAvatar}>{getChatName(chat).charAt(0).toUpperCase()}</span>
        <span>{getChatName(chat)}</span>
      </button>
    ));
  };

  const handleForward = () => {
    if (!selectedId || !user?.id) return;
    setError(null);

    const payload = buildForwardSendPayload(message, decryptedBodies, user.id);
    if (payload.blocked) {
      setError(payload.blockedReason ?? 'Attachments are not ready to forward yet.');
      return;
    }

    const target = chats.find((c) => c.id === selectedId);
    sendMessage(
      {
        chatId: selectedId,
        text: payload.text,
        kind: payload.kind,
        contentMeta: payload.contentMeta,
        chat: target as import('../types').Chat | undefined,
        peerUserId: target?.type === 'DIRECT' ? target.dmPeer?.id : undefined,
      },
      {
        onSuccess: () => {
          setActiveId(selectedId);
          scrollToBottom();
          onClose();
        },
        onError: () => setError("We couldn't forward this message. Please try again."),
      },
    );
  };

  return (
    <ModalDialog className={styles.overlay} aria-label="Forward message" onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>
            <Forward size={18} />
            Forward message
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={styles.preview}>{preview || 'Attachment'}</p>
        <div className={styles.list}>{renderChatList()}</div>
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="button"
          className={styles.sendBtn}
          disabled={!selectedId || isPending}
          onClick={handleForward}
        >
          {isPending ? <Loader2 size={16} className={styles.spinner} /> : 'Send'}
        </button>
      </div>
    </ModalDialog>
  );
};

export default ForwardMessageModal;
