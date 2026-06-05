import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './MainLayout.module.css';
import { handler } from '../utils/asyncHandler';
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
  Plus,
  Users,
  Hash,
} from 'lucide-react';
import GroupChannelIcon from '../features/chat/components/GroupChannelIcon';
import UserAvatar from '../features/chat/components/UserAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import ConnectionStatus from '../features/chat/components/ConnectionStatus';
import NewDmModal from '../features/chat/components/NewDmModal';
import CreateGroupModal from '../features/chat/components/CreateGroupModal';
import JumpToSearch from '../features/chat/components/JumpToSearch';
import ChatListSkeleton from '../features/chat/components/ChatListSkeleton';
import { overlayPanelEventProps } from '../utils/a11y';
import { GroupActionsModal } from './GroupActionsModal';
import { SidebarChatRow } from './SidebarChatRow';
import { useDismissOnDocumentClick } from './useDismissOnDocumentClick';
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
  const invalidateConversations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  const pinMutation = useMutation({
    mutationFn: ({ chatId, pinned }: { chatId: string; pinned: boolean }) =>
      patchChatPin(chatId, pinned),
    onSuccess: invalidateConversations,
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ chatId, favorited }: { chatId: string; favorited: boolean }) =>
      patchChatFavorite(chatId, favorited),
    onSuccess: invalidateConversations,
  });
  const closeDmMutation = useMutation({
    mutationFn: ({ chatId, closed }: { chatId: string; closed: boolean }) =>
      patchChatClose(chatId, closed),
    onSuccess: (_data, { chatId, closed }) => {
      invalidateConversations();
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

  const openJumpTo = useCallback(() => setShowJumpTo(true), []);
  const closeJumpTo = useCallback(() => setShowJumpTo(false), []);

  const goHome = useCallback(() => {
    setActiveId(null);
    navigate({ pathname: '/', search: '' }, { replace: true });
  }, [navigate, setActiveId]);

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

  const handlePinToggle = (chatId: string, pinned: boolean) => {
    setPinMenu(null);
    void pinMutation.mutateAsync({ chatId, pinned });
  };

  useDismissOnDocumentClick(Boolean(pinMenu), () => setPinMenu(null));
  useDismissOnDocumentClick(Boolean(chatMenu), () => setChatMenu(null));

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
      invalidateConversations();
      setLeaveGroupChat(null);
    } catch {
      toast.error('Could not leave group');
    } finally {
      setLeaveGroupPending(false);
    }
  };

  const renderSidebarRow = (chat: Chat, variant: 'dm' | 'group') => {
    const chatName = getChatName(chat);
    const isOnline =
      variant === 'dm' && chat.dmPeer?.id != null && onlineUsers.has(chat.dmPeer.id);
    return (
      <SidebarChatRow
        key={chat.id}
        chat={chat}
        variant={variant}
        active={activeId === chat.id}
        menuOpen={chatMenu?.chatId === chat.id}
        isOnline={isOnline}
        chatName={chatName}
        groupVisibilityLabel={variant === 'group' ? groupVisibilityLabel(chat) : undefined}
        formatUnread={formatUnread}
        onSelect={() => setActiveId(chat.id)}
        onOpenMenu={(e) => openChatMenu(e, chat)}
      />
    );
  };

  const renderFavoriteRow = (chat: Chat) =>
    renderSidebarRow(chat, chat.type === 'GROUP' ? 'group' : 'dm');

  return (
    <div className={`${styles.container} ${activeId ? styles.hasActiveChat : ''}`}>
      <ConnectionStatus />
      
      {/* 1. Slim Workspace Bar */}
      <nav className={styles.workspaceBar}>
        <button
          type="button"
          className={`${styles.workspaceIcon} ${styles.activeWorkspace}`}
          title="Home"
          aria-label="Go to home"
          onClick={goHome}
        >
          <ChatSystemLogo variant="mark" size="xs" />
        </button>
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
        <button
          type="button"
          className={styles.sidebarHeader}
          onClick={goHome}
          aria-label="Go to home"
        >
          <ChatSystemLogo variant="full" size="sm" theme="dark" className={styles.sidebarBrandFull} />
          <ChatSystemLogo variant="mark" size="xs" className={styles.sidebarBrandMark} />
        </button>
        
        <div className={styles.searchContainer}>
          <button
            type="button"
            className={styles.searchBar}
            onClick={() => openJumpTo()}
            aria-label="Jump to conversation (Ctrl+K)"
          >
            <Search size={14} strokeWidth={3} />
            <span className={styles.searchPlaceholder}>Jump to...</span>
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </button>
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
                <button
                  type="button"
                  className={styles.sectionIconBtn}
                  onClick={() => setShowGroupActions(true)}
                  aria-label="Create group"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {openChannels.length === 0 && (
              <p className={styles.emptyHint}>No channels yet. Click + to create one.</p>
            )}
            {openChannels.map((chat) => renderSidebarRow(chat, 'group'))}
          </div>

          <div className={styles.navSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Direct Messages</span>
              <div className={styles.sectionActions}>
                <button
                  type="button"
                  className={styles.sectionIconBtn}
                  onClick={() => setShowNewDm(true)}
                  aria-label="Start direct message"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {openDms.length === 0 && favorites.length === 0 && (
              <p className={styles.emptyHint}>
                No conversations yet. Click + to message someone.
              </p>
            )}
            {openDms.map((chat) => renderSidebarRow(chat, 'dm'))}
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

          <div className={styles.userCard}>
            <button
              type="button"
              className={styles.userCardMain}
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
            >
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
            </button>
            <div className={styles.userActions}>
              <button
                type="button"
                className={styles.actionIcon}
                style={{ background: showUserMenu ? 'rgba(255,255,255,0.1)' : 'none' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                }}
                aria-label="Open account menu"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* 3. Main Content */}
      <main className={styles.main}>
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
      <GroupActionsModal
        open={showGroupActions}
        modalKey="group-actions"
        ariaLabel="Group actions"
        panelClassName={styles.groupActionsModal}
        onClose={() => setShowGroupActions(false)}
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
      </GroupActionsModal>
      <GroupActionsModal
        open={showPublicGroupsPicker}
        modalKey="public-groups"
        ariaLabel="Join public channels and groups"
        panelClassName={styles.groupActionsModal}
        onClose={() => setShowPublicGroupsPicker(false)}
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
            {joinablePublicGroups.map((chat) => (
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
      </GroupActionsModal>
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
          role="menu"
          tabIndex={-1}
          style={{ top: pinMenu.y, left: pinMenu.x }}
          {...overlayPanelEventProps}
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
        onConfirm={handler(handleLeaveGroupConfirm)}
        onCancel={() => setLeaveGroupChat(null)}
      />
    </div>
  );
};

export default MainLayout;
