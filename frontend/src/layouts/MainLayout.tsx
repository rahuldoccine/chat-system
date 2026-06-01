import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './MainLayout.module.css';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useConversations } from '../features/chat/hooks/useChatData';
import { patchChatPin, patchChatFavorite, patchChatClose } from '../features/chat/api/chatsApi';
import { leaveGroup } from '../features/chat/api/groupsApi';
import { splitSidebarChats } from '../features/chat/utils/sidebarChats';
import ChatSidebarMenu from '../features/chat/components/ChatSidebarMenu';
import ConfirmModal from '../features/chat/components/ConfirmModal';
import { toast } from 'sonner';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useSocket } from '../context/SocketContext';
import {
  LogOut,
  Settings,
  Search,
  BellOff,
  Plus,
  Users,
  Hash,
  MoreHorizontal,
  Star,
} from 'lucide-react';
import GroupChannelIcon from '../features/chat/components/GroupChannelIcon';
import { isChatMuted } from '../features/chat/utils/mute';
import UserAvatar from '../features/chat/components/UserAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import ConnectionStatus from '../features/chat/components/ConnectionStatus';
import E2eeUnlockBanner from '../features/e2ee/E2eeUnlockBanner';
import E2eeUnlockModal from '../features/e2ee/E2eeUnlockModal';
import NewDmModal from '../features/chat/components/NewDmModal';
import CreateGroupModal from '../features/chat/components/CreateGroupModal';
import JumpToSearch from '../features/chat/components/JumpToSearch';
import ChatListSkeleton from '../features/chat/components/ChatListSkeleton';
import ChatSystemLogo from '../components/brand/ChatSystemLogo';
import EmptyState from '../features/chat/components/EmptyState';
import type { Chat } from '../features/chat/types';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeId, setActiveId } = useChat();
  const { onlineUsers } = useSocket();
  const queryClient = useQueryClient();
  const { data: response, isLoading: conversationsLoading } = useConversations();
  const pinMutation = useMutation({
    mutationFn: ({ chatId, pinned }: { chatId: string; pinned: boolean }) =>
      patchChatPin(chatId, pinned),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ chatId, favorited }: { chatId: string; favorited: boolean }) =>
      patchChatFavorite(chatId, favorited),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  const closeDmMutation = useMutation({
    mutationFn: ({ chatId, closed }: { chatId: string; closed: boolean }) =>
      patchChatClose(chatId, closed),
    onSuccess: (_data, { chatId, closed }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (closed && activeId === chatId) setActiveId(null);
    },
  });

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pinMenu, setPinMenu] = useState<{ chatId: string; x: number; y: number; pinned: boolean } | null>(null);
  const [chatMenu, setChatMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [leaveGroupChat, setLeaveGroupChat] = useState<Chat | null>(null);
  const [leaveGroupPending, setLeaveGroupPending] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [showPublicGroupsPicker, setShowPublicGroupsPicker] = useState(false);
  const [showJumpTo, setShowJumpTo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openJumpTo = useCallback(() => setShowJumpTo(true), []);
  const closeJumpTo = useCallback(() => setShowJumpTo(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openJumpTo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openJumpTo]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const onNewDm = () => setShowNewDm(true);
    const onCreateGroup = () => setShowGroupActions(true);
    const onJumpTo = () => openJumpTo();
    globalThis.addEventListener('chat:open-new-dm', onNewDm);
    globalThis.addEventListener('chat:open-create-group', onCreateGroup);
    globalThis.addEventListener('chat:open-jump-to', onJumpTo);
    return () => {
      globalThis.removeEventListener('chat:open-new-dm', onNewDm);
      globalThis.removeEventListener('chat:open-create-group', onCreateGroup);
      globalThis.removeEventListener('chat:open-jump-to', onJumpTo);
    };
  }, [openJumpTo]);

  const conversations: Chat[] = response?.data ?? [];

  const channels = conversations.filter(
    (c) => c.type === 'GROUP' && c.isMember !== false,
  );
  const dms = conversations.filter((c) => c.type === 'DIRECT');
  const { favorites, openChannels, directMessages: openDms } = splitSidebarChats(channels, dms);
  const joinablePublicGroups = conversations.filter(
    (chat) => chat.groupVisibility === 'PUBLIC' && chat.canJoin && chat.isMember === false,
  );

  const getChatName = (chat: Chat) => {
    if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
    return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
  };

  const groupVisibilityLabel = (chat: Chat) =>
    chat.groupVisibility === 'PUBLIC' ? 'Public channel' : 'Private group';

  const formatUnread = (count: number) => (count > 99 ? '99+' : String(count));

  const openPinMenu = (e: React.MouseEvent, chat: Chat) => {
    e.preventDefault();
    setPinMenu({
      chatId: chat.id,
      x: e.clientX,
      y: e.clientY,
      pinned: Boolean(chat.pinnedAt),
    });
  };

  const handlePinToggle = (chatId: string, pinned: boolean) => {
    setPinMenu(null);
    void pinMutation.mutateAsync({ chatId, pinned });
  };

  useEffect(() => {
    if (!pinMenu) return;
    const close = () => setPinMenu(null);
    const timer = globalThis.setTimeout(() => {
      document.addEventListener('click', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [pinMenu]);

  useEffect(() => {
    if (!chatMenu) return;
    const close = () => setChatMenu(null);
    const timer = globalThis.setTimeout(() => {
      document.addEventListener('click', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [chatMenu]);

  const findChatById = (chatId: string) => conversations.find((c) => c.id === chatId);

  const openChatMenu = (e: React.MouseEvent, chat: Chat) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setChatMenu((prev) =>
      prev?.chatId === chat.id
        ? null
        : { chatId: chat.id, x: e.clientX, y: e.clientY },
    );
  };

  const openDmSettingsForActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    const activeDm = activeId ? dms.find((c) => c.id === activeId) : null;
    if (!activeDm) return;
    openChatMenu(e, activeDm);
  };

  const openGroupSettingsForActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    const activeGroup = activeId
      ? conversations.find((c) => c.id === activeId && c.type === 'GROUP')
      : null;
    if (!activeGroup) return;
    openChatMenu(e, activeGroup);
  };

  const chatMenuChat = chatMenu?.chatId ? findChatById(chatMenu.chatId) : null;

  const handleChatFavorite = (chat: Chat) => {
    setChatMenu(null);
    void favoriteMutation.mutateAsync({ chatId: chat.id, favorited: !chat.favoritedAt });
  };

  const handleDmClose = (chat: Chat) => {
    setChatMenu(null);
    void closeDmMutation.mutateAsync({ chatId: chat.id, closed: !chat.closedAt });
  };

  const requestLeaveGroup = (chat: Chat) => {
    setChatMenu(null);
    setLeaveGroupChat(chat);
  };

  const handleLeaveGroupConfirm = async () => {
    if (!leaveGroupChat || !user?.id) return;
    setLeaveGroupPending(true);
    try {
      await leaveGroup(leaveGroupChat.id, user.id);
      if (activeId === leaveGroupChat.id) setActiveId(null);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setLeaveGroupChat(null);
    } catch {
      toast.error('Could not leave group');
    } finally {
      setLeaveGroupPending(false);
    }
  };

  const renderDmRow = (chat: Chat) => {
    const isOnline = chat.dmPeer && onlineUsers.has(chat.dmPeer.id);
    return (
      <div
        key={chat.id}
        className={`${styles.dmRowWrap} ${chatMenu?.chatId === chat.id ? styles.dmRowMenuOpen : ''}`}
      >
        <button
          type="button"
          onClick={() => setActiveId(chat.id)}
          onContextMenu={(e) => openChatMenu(e, chat)}
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
          {chat.favoritedAt && (
            <Star size={12} className={styles.favoriteStar} aria-label="Favorite" />
          )}
          {isChatMuted(chat.mutedUntil) && (
            <BellOff size={14} className={styles.mutedIcon} aria-label="Muted" />
          )}
          {isOnline && <span className={styles.onlineDot} />}
          {chat.unreadMentionCount != null && chat.unreadMentionCount > 0 && (
            <span className={styles.mentionBadge} aria-label="Unread mentions">@</span>
          )}
          {chat.unreadCount > 0 && (
            <span className={styles.unreadBadge}>{formatUnread(chat.unreadCount)}</span>
          )}
          {chat.unreadCount > 0 && <span className={styles.unreadDot} aria-hidden />}
          {chat.pinnedAt && <span className={styles.pinIcon} aria-label="Pinned">📌</span>}
        </button>
        <button
          type="button"
          className={styles.dmMoreBtn}
          aria-label={`DM settings for ${getChatName(chat)}`}
          onClick={(e) => openChatMenu(e, chat)}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    );
  };

  const renderGroupRow = (chat: Chat) => (
    <div
      key={chat.id}
      className={`${styles.dmRowWrap} ${chatMenu?.chatId === chat.id ? styles.dmRowMenuOpen : ''}`}
    >
      <button
        type="button"
        onClick={() => setActiveId(chat.id)}
        onContextMenu={(e) => openChatMenu(e, chat)}
        className={`${styles.navItem} ${activeId === chat.id ? styles.active : ''}`}
        aria-label={`${getChatName(chat)} — ${groupVisibilityLabel(chat)}`}
        title={groupVisibilityLabel(chat)}
      >
        <GroupChannelIcon
          visibility={chat.groupVisibility}
          size={18}
          strokeWidth={2.5}
          className={styles.channelAvatar}
        />
        <span className={styles.navLabel}>{getChatName(chat)}</span>
        {chat.favoritedAt && (
          <Star size={12} className={styles.favoriteStar} aria-label="Favorite" />
        )}
        {chat.unreadMentionCount != null && chat.unreadMentionCount > 0 && (
          <span className={styles.mentionBadge} aria-label="Unread mentions">@</span>
        )}
        {chat.unreadCount > 0 && (
          <span className={styles.unreadBadge}>{formatUnread(chat.unreadCount)}</span>
        )}
        {chat.unreadCount > 0 && <span className={styles.unreadDot} aria-hidden />}
        {chat.pinnedAt && <span className={styles.pinIcon} aria-label="Pinned">📌</span>}
      </button>
      <button
        type="button"
        className={styles.dmMoreBtn}
        aria-label={`Channel settings for ${getChatName(chat)}`}
        onClick={(e) => openChatMenu(e, chat)}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );

  const renderFavoriteRow = (chat: Chat) =>
    chat.type === 'GROUP' ? renderGroupRow(chat) : renderDmRow(chat);

  return (
    <>
    <div className={`${styles.container} ${activeId ? styles.hasActiveChat : ''}`}>
      <ConnectionStatus />
      
      {/* 1. Slim Workspace Bar */}
      <nav className={styles.workspaceBar}>
        <div className={`${styles.workspaceIcon} ${styles.activeWorkspace}`} title="Chat System">
          <ChatSystemLogo variant="mark" size="xs" />
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
          <ChatSystemLogo variant="full" size="sm" theme="dark" className={styles.sidebarBrandFull} />
          <ChatSystemLogo variant="mark" size="xs" className={styles.sidebarBrandMark} />
        </div>
        
        <div className={styles.searchContainer}>
          <div
            className={styles.searchBar}
            onClick={() => openJumpTo()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openJumpTo();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Jump to conversation (Ctrl+K)"
          >
            <Search size={14} strokeWidth={3} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Jump to..."
              readOnly
              onFocus={() => openJumpTo()}
            />
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </div>
        </div>

        <nav className={styles.nav}>
          {conversationsLoading && conversations.length === 0 ? (
            <ChatListSkeleton />
          ) : (
          <>
          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Favorites</span>
            </div>
            {favorites.length === 0 ? (
              <p className={styles.emptyHint}>Star a channel or DM to add it here.</p>
            ) : (
              favorites.map((chat) => renderFavoriteRow(chat))
            )}
          </div>

          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Channels</span>
              <div className={styles.sectionActions}>
                <Plus
                  size={14}
                  className={styles.addIcon}
                  onClick={() => setShowGroupActions(true)}
                  role="button"
                  aria-label="Create group"
                />
              </div>
            </div>
            {openChannels.length === 0 && (
              <p className={styles.emptyHint}>No channels yet. Click + to create one.</p>
            )}
            {openChannels.map((chat) => renderGroupRow(chat))}
          </div>

          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Direct Messages</span>
              <div className={styles.sectionActions}>
                <Plus
                  size={14}
                  className={styles.addIcon}
                  onClick={() => setShowNewDm(true)}
                  role="button"
                  aria-label="Start direct message"
                />
              </div>
            </div>
            {openDms.length === 0 && favorites.length === 0 && (
              <p className={styles.emptyHint}>
                No conversations yet. Click + to message someone.
              </p>
            )}
            {openDms.map((chat) => renderDmRow(chat))}
          </div>
          </>
          )}
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
        <E2eeUnlockModal />
        <div className={styles.content}>
          {children}
        </div>
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
                <EmptyState
                  compact
                  title="No public channels"
                  hint="Check back later or create your own group."
                />
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

      <JumpToSearch
        open={showJumpTo}
        onClose={closeJumpTo}
        onSelectChat={(chatId) => setActiveId(chatId)}
      />

      {pinMenu && (
        <div
          className={styles.pinMenu}
          style={{ top: pinMenu.y, left: pinMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handlePinToggle(pinMenu.chatId, !pinMenu.pinned)}
          >
            {pinMenu.pinned ? 'Unpin chat' : 'Pin chat'}
          </button>
        </div>
      )}

      {chatMenu && chatMenuChat && (
        <ChatSidebarMenu
          variant={chatMenuChat.type === 'GROUP' ? 'group' : 'dm'}
          x={chatMenu.x}
          y={chatMenu.y}
          favorited={Boolean(chatMenuChat.favoritedAt)}
          closed={Boolean(chatMenuChat.closedAt)}
          onFavorite={() => handleChatFavorite(chatMenuChat)}
          onCloseDm={
            chatMenuChat.type === 'DIRECT'
              ? () => handleDmClose(chatMenuChat)
              : undefined
          }
          onLeaveGroup={
            chatMenuChat.type === 'GROUP'
              ? () => requestLeaveGroup(chatMenuChat)
              : undefined
          }
          onDismiss={() => setChatMenu(null)}
        />
      )}

      <ConfirmModal
        open={leaveGroupChat != null}
        title="Leave this group?"
        description="You will stop receiving messages from this group until you join again."
        confirmLabel="Leave group"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={leaveGroupPending}
        onConfirm={() => void handleLeaveGroupConfirm()}
        onCancel={() => setLeaveGroupChat(null)}
      />
    </div>
    </>
  );
};

export default MainLayout;
