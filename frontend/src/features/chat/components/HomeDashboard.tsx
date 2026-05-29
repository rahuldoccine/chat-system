import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Hash,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  Sparkles,
  Users,
  Wifi,
  AtSign,
} from 'lucide-react';
import type { Chat } from '../types';
import UserAvatar from './UserAvatar';
import GroupChannelIcon from './GroupChannelIcon';
import { getServerAccountKeyStatus } from '../../e2ee/recovery';
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

function dispatchUiAction(name: 'chat:open-new-dm' | 'chat:open-create-group' | 'chat:open-jump-to') {
  window.dispatchEvent(new CustomEvent(name));
}

const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userName,
  conversations,
  onlineUserIds,
  onSelectChat,
}) => {
  const [needsKeyBackup, setNeedsKeyBackup] = useState(false);

  useEffect(() => {
    void getServerAccountKeyStatus()
      .then((status) => setNeedsKeyBackup(status.hasIdentityKey && !status.hasBackup))
      .catch(() => setNeedsKeyBackup(false));
  }, []);

  const memberChats = useMemo(
    () =>
      conversations.filter(
        (c) => c.type === 'DIRECT' || (c.type === 'GROUP' && c.isMember !== false),
      ),
    [conversations],
  );

  const channels = memberChats.filter((c) => c.type === 'GROUP');
  const dms = memberChats.filter((c) => c.type === 'DIRECT');

  const totalUnread = memberChats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  const mentionUnread = memberChats.reduce((sum, c) => sum + (c.unreadMentionCount ?? 0), 0);
  const onlineDmCount = dms.filter((c) => c.dmPeer && onlineUserIds.has(c.dmPeer.id)).length;

  const recentChats = useMemo(() => {
    return [...memberChats]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
  }, [memberChats]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

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
          <p className={styles.backupWarning} role="status">
            Your encryption keys are not backed up to your account yet. Sign out and sign in with
            your password once to protect message history across devices.
          </p>
        ) : null}
      </motion.header>

      <div className={styles.statsGrid}>
        {[
          { label: 'Unread', value: totalUnread, accent: styles.statAccentRed },
          { label: 'Mentions', value: mentionUnread, accent: styles.statAccentIndigo },
          { label: 'Channels', value: channels.length, accent: styles.statAccentBlue },
          { label: 'Online DMs', value: onlineDmCount, accent: styles.statAccentGreen },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className={styles.statCard}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
          >
            <span className={`${styles.statValue} ${stat.accent}`}>{stat.value}</span>
            <span className={styles.statLabel}>{stat.label}</span>
          </motion.div>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <motion.section
          className={styles.panel}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
        >
          <div className={styles.panelHeader}>
            <h2>Quick actions</h2>
            <p>Jump in with one click</p>
          </div>
          <div className={styles.actionsGrid}>
            <button
              type="button"
              className={styles.actionCard}
              onClick={() => dispatchUiAction('chat:open-new-dm')}
            >
              <span className={`${styles.actionIcon} ${styles.actionIconPrimary}`}>
                <MessageSquarePlus size={20} />
              </span>
              <span className={styles.actionTitle}>New message</span>
              <span className={styles.actionHint}>Start a direct chat</span>
            </button>
            <button
              type="button"
              className={styles.actionCard}
              onClick={() => dispatchUiAction('chat:open-create-group')}
            >
              <span className={`${styles.actionIcon} ${styles.actionIconViolet}`}>
                <Users size={20} />
              </span>
              <span className={styles.actionTitle}>Create group</span>
              <span className={styles.actionHint}>Channels & teams</span>
            </button>
            <button
              type="button"
              className={styles.actionCard}
              onClick={() => dispatchUiAction('chat:open-jump-to')}
            >
              <span className={`${styles.actionIcon} ${styles.actionIconSlate}`}>
                <Search size={20} />
              </span>
              <span className={styles.actionTitle}>Jump to…</span>
              <span className={styles.actionHint}>
                <kbd className={styles.kbd}>Ctrl</kbd>+<kbd className={styles.kbd}>K</kbd>
              </span>
            </button>
          </div>
        </motion.section>

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
