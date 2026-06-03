import React from 'react';
import { motion } from 'framer-motion';
import { AtSign, Hash, MessagesSquare, Sparkles, Wifi } from 'lucide-react';
import type { Chat } from '../types';
import UserAvatar from './UserAvatar';
import GroupChannelIcon from './GroupChannelIcon';
import HomeDashboardStats from './HomeDashboardStats';
import HomeQuickActions from './HomeQuickActions';
import { useHomeDashboardMetrics } from '../hooks/useHomeDashboardMetrics';
import styles from './HomeDashboard.module.css';

type HomeDashboardProps = {
  userName?: string;
  conversations: Chat[];
  onlineUserIds: Set<string>;
  onSelectChat: (chatId: string) => void;
};

function getChatLabel(chat: Chat): string {
  if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
  return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
}

const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userName,
  conversations,
  onlineUserIds,
  onSelectChat,
}) => {
  const {
    greeting,
    needsKeyBackup,
    memberChats,
    channels,
    totalUnread,
    mentionUnread,
    onlineDmCount,
    recentChats,
  } = useHomeDashboardMetrics(conversations, onlineUserIds);

  return (
    <div className={styles.root}>
      <div className={styles.bgGlow} aria-hidden />

      <motion.header
        className={styles.hero}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className={styles.heroBadge}>
          <Sparkles size={14} />
          Workspace
        </div>
        <h1 className={styles.heroTitle}>
          {greeting}
          {userName ? `, ${userName.split(' ')[0]}` : ''}
        </h1>
        <p className={styles.heroSubtitle}>
          Pick up where you left off or start something new with your team.
        </p>
        {needsKeyBackup ? (
          <output className={styles.backupWarning}>
            Your encryption keys are not backed up to your account yet. Sign out and sign in with
            your password once to protect message history across devices.
          </output>
        ) : null}
      </motion.header>

      <HomeDashboardStats
        totalUnread={totalUnread}
        mentionUnread={mentionUnread}
        channelCount={channels.length}
        onlineDmCount={onlineDmCount}
      />

      <div className={styles.mainGrid}>
        <HomeQuickActions />

        <motion.section
          className={styles.panel}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.35 }}
        >
          <div className={styles.panelHeader}>
            <h2>Recent conversations</h2>
            <p>{memberChats.length ? 'Continue chatting' : 'Your chats will appear here'}</p>
          </div>
          {recentChats.length === 0 ? (
            <div className={styles.emptyRecent}>
              <MessagesSquare size={28} strokeWidth={1.5} />
              <p>No conversations yet. Start a DM or create a group from the sidebar.</p>
            </div>
          ) : (
            <ul className={styles.recentList}>
              {recentChats.map((chat) => {
                const label = getChatLabel(chat);
                const isOnline =
                  chat.type === 'DIRECT' &&
                  chat.dmPeer &&
                  onlineUserIds.has(chat.dmPeer.id);
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      className={styles.recentItem}
                      onClick={() => onSelectChat(chat.id)}
                    >
                      <div className={styles.recentAvatarWrap}>
                        {chat.type === 'GROUP' ? (
                          <GroupChannelIcon
                            visibility={chat.groupVisibility}
                            size={20}
                            className={styles.recentGroupIcon}
                          />
                        ) : (
                          <UserAvatar
                            userId={chat.dmPeer?.id}
                            avatarUrl={chat.dmPeer?.avatarUrl}
                            displayName={chat.dmPeer?.displayName}
                            email={chat.dmPeer?.email}
                            className={styles.recentAvatar}
                          />
                        )}
                        {isOnline && <span className={styles.onlineDot} />}
                      </div>
                      <div className={styles.recentBody}>
                        <span className={styles.recentName}>{label}</span>
                        <span className={styles.recentMeta}>
                          {chat.type === 'GROUP' ? (
                            <>
                              <Hash size={12} /> Channel
                            </>
                          ) : (
                            <>
                              <Wifi size={12} /> Direct message
                            </>
                          )}
                        </span>
                      </div>
                      <div className={styles.recentBadges}>
                        {(chat.unreadMentionCount ?? 0) > 0 && (
                          <span className={styles.mentionBadge} aria-label="Unread mentions">
                            <AtSign size={11} />
                          </span>
                        )}
                        {(chat.unreadCount ?? 0) > 0 && (
                          <span className={styles.unreadBadge}>
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </div>

      <motion.footer
        className={styles.tips}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      >
        <strong>Tip:</strong> Use <kbd className={styles.kbdInline}>@mentions</kbd> in groups to notify
        specific teammates, or <kbd className={styles.kbdInline}>@all</kbd> (admins) to reach everyone.
      </motion.footer>
    </div>
  );
};

export default HomeDashboard;
