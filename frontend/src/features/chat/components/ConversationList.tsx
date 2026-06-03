import React from 'react';
import styles from './ConversationList.module.css';
import { useChat } from '../../../context/ChatContext';
import { useConversations } from '../hooks/useChatData';
import { useSocket } from '../../../context/SocketContext';
import type { Chat } from '../types';
import { isDmE2eeChat } from '../../e2ee/chatE2ee';
import { getConversationLastMessagePreview } from '../utils/messagePreview';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import ChatAvatar from './ChatAvatar';
import UserAvatar from './UserAvatar';

const ConversationList: React.FC = () => {
  const { activeId, setActiveId } = useChat();
  const { onlineUsers } = useSocket();
  const { data: response, isLoading, error } = useConversations();

  // The backend returns { data: Chat[], nextCursor: string }
  const conversations = (response as any)?.data as Chat[] | undefined;

  const getChatName = (chat: Chat) => {
    if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
    return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 className={styles.spinner} />
        <span>Loading chats...</span>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Chats couldn't be loaded. Please refresh the page.</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Messages</h3>
        <span className={styles.count}>{conversations?.length || 0}</span>
      </div>
      
      <div className={styles.list}>
        {conversations?.map((chat, i) => {
          const chatName = getChatName(chat);
          return (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveId(chat.id)}
              className={`${styles.item} ${activeId === chat.id ? styles.active : ''}`}
            >
              <div className={styles.avatarWrapper}>
                <div className={styles.avatar}>
                  {chat.type === 'GROUP' ? (
                    <ChatAvatar chat={chat} chatName={chatName} size={40} borderRadius="50%" />
                  ) : (
                    <UserAvatar
                      userId={chat.dmPeer?.id}
                      avatarUrl={chat.dmPeer?.avatarUrl}
                      displayName={chat.dmPeer?.displayName}
                      email={chat.dmPeer?.email}
                      fallbackFontSize="1rem"
                      style={{ width: '100%', height: '100%' }}
                    />
                  )}
                </div>
                {chat.type === 'DIRECT' && chat.dmPeer?.id != null && (chat.dmPeer.isOnline || onlineUsers.has(chat.dmPeer.id)) && (
                  <div className={styles.onlineIndicator} />
                )}
              </div>
              
              <div className={styles.content}>
                <div className={styles.row}>
                  <span className={styles.name}>{chatName}</span>
                  <span className={styles.time}>
                    {chat.lastMessage ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className={styles.row}>
                  <p className={styles.lastMsg}>
                    {getConversationLastMessagePreview(
                      chat.lastMessage?.ciphertext,
                      isDmE2eeChat(chat),
                    )}
                  </p>
                  {chat.unreadCount > 0 && <span className={styles.unreadBadge}>{chat.unreadCount}</span>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ConversationList;
