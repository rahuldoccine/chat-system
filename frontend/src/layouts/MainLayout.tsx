import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './MainLayout.module.css';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useConversations } from '../features/chat/hooks/useChatData';
import { useSocket } from '../context/SocketContext';
import {
  LogOut,
  Settings,
  Search,
  Bell,
  BellOff,
  LayoutGrid,
  Plus,
  Users,
  Hash,
} from 'lucide-react';
import GroupChannelIcon from '../features/chat/components/GroupChannelIcon';
import { isChatMuted } from '../features/chat/utils/mute';
import UserAvatar from '../features/chat/components/UserAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import ConnectionStatus from '../features/chat/components/ConnectionStatus';
import E2eeUnlockBanner from '../features/e2ee/E2eeUnlockBanner';
import NewDmModal from '../features/chat/components/NewDmModal';
import CreateGroupModal from '../features/chat/components/CreateGroupModal';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeId, setActiveId } = useChat();
  const { onlineUsers } = useSocket();
  const { data: response } = useConversations();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [showPublicGroupsPicker, setShowPublicGroupsPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const conversations = (response as any)?.data || [];
  
  const channels = conversations.filter(
    (c: any) => c.type === 'GROUP' && c.isMember !== false,
  );
  const dms = conversations.filter((c: any) => c.type === 'DIRECT');
  const joinablePublicGroups = conversations.filter(
    (chat: any) => chat.groupVisibility === 'PUBLIC' && chat.canJoin && chat.isMember === false,
  );

  const getChatName = (chat: any) => {
    if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
    return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
  };

  const formatUnread = (count: number) => (count > 99 ? '99+' : String(count));

  return (
    <>
    <div className={`${styles.container} ${activeId ? styles.hasActiveChat : ''}`}>
      <ConnectionStatus />
      
      {/* 1. Slim Workspace Bar */}
      <nav className={styles.workspaceBar}>
        <div className={`${styles.workspaceIcon} ${styles.activeWorkspace}`}>
          <LayoutGrid size={24} strokeWidth={2.5} />
        </div>
        <div className={styles.workspaceDivider}></div>
        <div className={styles.workspaceIcon}>
          <div className={styles.workspaceLetter}>D</div>
        </div>
        <div className={styles.workspaceIcon}>
          <div className={styles.workspaceLetter}>T</div>
        </div>
        <div className={`${styles.workspaceIcon} ${styles.addWorkspace}`}>
          <Plus size={22} />
        </div>
      </nav>

      {/* 2. Main Sidebar - Dynamic Conversations */}
      <motion.aside 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className={styles.sidebar}
      >
        <div className={styles.sidebarHeader}>
          <h2 className={styles.platformName}>Chat System</h2>
          <button className={styles.notificationBtn}>
            <Bell size={18} />
          </button>
        </div>
        
        <div className={styles.searchContainer}>
          <div className={styles.searchBar}>
            <Search size={14} strokeWidth={3} />
            <input type="text" placeholder="Jump to..." />
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Channels</span>
              <Plus
                size={14}
                className={styles.addIcon}
                onClick={() => setShowGroupActions(true)}
                role="button"
                aria-label="Create group"
              />
            </div>
            {channels.map((chat: any) => (
              <button 
                key={chat.id}
                onClick={() => setActiveId(chat.id)}
                className={`${styles.navItem} ${activeId === chat.id ? styles.active : ''}`}
              >
                <GroupChannelIcon
                  visibility={chat.groupVisibility}
                  size={18}
                  strokeWidth={2.5}
                  className={styles.channelAvatar}
                />
                <span className={styles.navLabel}>{getChatName(chat)}</span>
                {chat.unreadCount > 0 && (
                  <span className={styles.unreadBadge}>{formatUnread(chat.unreadCount)}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Direct Messages</span>
              <Plus
                size={14}
                className={styles.addIcon}
                onClick={() => setShowNewDm(true)}
                role="button"
                aria-label="Start direct message"
              />
            </div>
            {dms.length === 0 && (
              <p className={styles.emptyHint}>
                No conversations yet. Click + to message someone.
              </p>
            )}
            {dms.map((chat: any) => {
              const isOnline = chat.dmPeer && onlineUsers.has(chat.dmPeer.id);
              return (
                <button 
                  key={chat.id}
                  onClick={() => setActiveId(chat.id)}
                  className={`${styles.navItem} ${activeId === chat.id ? styles.active : ''}`}
                >
                  <UserAvatar
                    userId={chat.dmPeer?.id}
                    avatarUrl={chat.dmPeer?.avatarUrl}
                    displayName={chat.dmPeer?.displayName}
                    email={chat.dmPeer?.email}
                    className={styles.miniAvatar}
                  />
                  <span className={styles.navLabel}>{getChatName(chat)}</span>
                  {isChatMuted(chat.mutedUntil) && (
                    <BellOff size={14} className={styles.mutedIcon} aria-label="Muted" />
                  )}
                  {isOnline && <span className={styles.onlineDot}></span>}
                  {chat.unreadCount > 0 && (
                    <span className={styles.unreadBadge}>{formatUnread(chat.unreadCount)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className={styles.userSection} ref={menuRef}>
          <AnimatePresence>
            {showUserMenu && (
              <motion.div 
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={styles.userMenu}
              >
                <div className={styles.menuHeader}>
                  <span className={styles.menuTitle}>Account Details</span>
                </div>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUserMenu(false);
                    // Clear chat focus before route switch to avoid stale chat view state.
                    setActiveId(null);
                    navigate('/settings', { replace: true });
                  }}
                >
                  <Settings size={16} />
                  <span>My Settings</span>
                </button>
                <div className={styles.menuDivider}></div>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.logoutMenuItem}`}
                  onClick={() => {
                    setShowUserMenu(false);
                    void logout().then(() => navigate('/login', { replace: true }));
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={styles.userCard} onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className={styles.avatarContainer}>
              <UserAvatar
                userId={user?.id}
                avatarUrl={user?.avatar}
                displayName={user?.name}
                email={user?.email}
                className={styles.avatarImg}
              />
              <div className={styles.onlineBadge}></div>
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userStatus}>Online</span>
            </div>
            <div className={styles.userActions}>
              <button 
                className={styles.actionIcon}
                style={{ background: showUserMenu ? 'rgba(255,255,255,0.1)' : 'none' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                }}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* 3. Main Content */}
      <main className={styles.main}>
        <E2eeUnlockBanner />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId || 'empty'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.content}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {showNewDm && (
        <NewDmModal
          onClose={() => setShowNewDm(false)}
          onChatCreated={(chatId) => setActiveId(chatId)}
        />
      )}
      <AnimatePresence>
        {showGroupActions && (
          <motion.div
            className={styles.groupActionsOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGroupActions(false)}
          >
            <motion.div
              className={styles.groupActionsModal}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={styles.groupActionsTitle}>Group actions</h3>
              <p className={styles.groupActionsHint}>Choose what you want to do next.</p>

              <button
                type="button"
                className={styles.groupActionBtn}
                onClick={() => {
                  setShowGroupActions(false);
                  setShowNewGroup(true);
                }}
              >
                <Users size={16} />
                <span>Create Group</span>
              </button>

              <button
                type="button"
                className={styles.groupActionBtn}
                onClick={() => {
                  setShowGroupActions(false);
                  setShowPublicGroupsPicker(true);
                }}
              >
                <Hash size={16} />
                <span>Join Public Channels/Groups</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPublicGroupsPicker && (
          <motion.div
            className={styles.groupActionsOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPublicGroupsPicker(false)}
          >
            <motion.div
              className={styles.groupActionsModal}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={styles.groupActionsTitle}>Join Public Channels/Groups</h3>
              <p className={styles.groupActionsHint}>Select a public channel to join.</p>
              {joinablePublicGroups.length === 0 ? (
                <div className={styles.emptyPublicGroups}>No public channels available right now.</div>
              ) : (
                <div className={styles.publicGroupsList}>
                  {joinablePublicGroups.map((chat: any) => (
                    <button
                      key={chat.id}
                      type="button"
                      className={styles.publicGroupItem}
                      onClick={() => {
                        setShowPublicGroupsPicker(false);
                        setActiveId(chat.id);
                      }}
                    >
                      <GroupChannelIcon visibility={chat.groupVisibility} size={16} strokeWidth={2.4} />
                      <span className={styles.publicGroupName}>{getChatName(chat)}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewGroup && (
          <CreateGroupModal
            onClose={() => setShowNewGroup(false)}
            onChatCreated={(chatId) => setActiveId(chatId)}
          />
        )}
      </AnimatePresence>
    </div>
    </>
  );
};

export default MainLayout;
