import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Hash, Loader2, MessageCircle, Search, User, X } from 'lucide-react';
import {
  useConversations,
  useCreateDirectChat,
  useSearchUsers,
  type DiscoverableUser,
} from '../hooks/useChatData';
import type { Chat } from '../types';
import UserAvatar from './UserAvatar';
import GroupChannelIcon from './GroupChannelIcon';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './JumpToSearch.module.css';
import { handler } from '../../../utils/asyncHandler';

type JumpToSearchProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}>;

type JumpItem =
  | { kind: 'chat'; id: string; chat: Chat; label: string }
  | { kind: 'user'; id: string; user: DiscoverableUser; label: string };

function getChatLabel(chat: Chat): string {
  if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
  return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function renderPeopleResults(
  showUserLoading: boolean,
  matchingUsers: DiscoverableUser[],
  creating: boolean,
  flatItems: JumpItem[],
  activeIndex: number,
  setActiveIndex: (index: number) => void,
  handleSelectUser: (user: DiscoverableUser) => Promise<void>,
): React.ReactNode {
  if (showUserLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={18} className={styles.spinner} />
        Searching…
      </div>
    );
  }
  if (matchingUsers.length === 0) {
    return <p className={styles.hintSmall}>No new people match.</p>;
  }
  return (
    <ul className={styles.list}>
      {matchingUsers.map((user) => {
        const idx = flatItems.findIndex(
          (it) => it.kind === 'user' && it.user.id === user.id,
        );
        const active = idx === activeIndex;
        const label = user.displayName || user.username || user.email;
        return (
          <li key={user.id}>
            <button
              type="button"
              className={`${styles.item} ${active ? styles.itemActive : ''}`}
              disabled={creating}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={handler(() => handleSelectUser(user))}
            >
              <UserAvatar
                userId={user.id}
                avatarUrl={user.avatarUrl}
                displayName={user.displayName}
                email={user.email}
                className={styles.itemAvatar}
              />
              <span className={styles.itemLabel}>{label}</span>
              <span className={styles.itemMeta}>
                <User size={12} /> Start DM
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const JumpToSearch: React.FC<JumpToSearchProps> = ({ open, onClose, onSelectChat }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);

  const { data: response } = useConversations();
  const conversations = response?.data ?? [];
  const normalized = normalizeQuery(query);
  const userSearchEnabled = open && normalized.length >= 1;
  const { data: userData, isLoading: usersLoading, isFetching: usersFetching } = useSearchUsers(
    query.trim(),
    userSearchEnabled,
  );

  const createChat = useCreateDirectChat();

  const memberChats = useMemo(
    () =>
      conversations.filter(
        (c) => c.type === 'DIRECT' || (c.type === 'GROUP' && c.isMember !== false),
      ),
    [conversations],
  );

  const matchingChats = useMemo(() => {
    if (!normalized) return memberChats.slice(0, 8);
    return memberChats.filter((c) => getChatLabel(c).toLowerCase().includes(normalized));
  }, [memberChats, normalized]);

  const matchingUsers = useMemo(() => {
    if (!normalized) return [];
    const users = userData?.data ?? [];
    const existingPeerIds = new Set(
      memberChats
        .filter((c) => c.type === 'DIRECT' && c.dmPeer?.id)
        .map((c) => c.dmPeer?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return users.filter((u) => !existingPeerIds.has(u.id));
  }, [userData?.data, memberChats, normalized]);

  const flatItems: JumpItem[] = useMemo(() => {
    const items: JumpItem[] = [];
    for (const chat of matchingChats) {
      items.push({ kind: 'chat', id: `chat-${chat.id}`, chat, label: getChatLabel(chat) });
    }
    for (const user of matchingUsers) {
      const label = user.displayName || user.username || user.email;
      items.push({ kind: 'user', id: `user-${user.id}`, user, label });
    }
    return items;
  }, [matchingChats, matchingUsers]);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, queryClient]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      onSelectChat(chatId);
      navigate(`/?chat=${chatId}`, { replace: false });
      onClose();
    },
    [onSelectChat, navigate, onClose],
  );

  const handleSelectUser = useCallback(
    async (user: DiscoverableUser) => {
      if (creating) return;
      setCreating(true);
      try {
        const result = await createChat.mutateAsync(user.id);
        handleSelectChat(result.chat.id);
      } catch {
        // axios handles errors
      } finally {
        setCreating(false);
      }
    },
    [creating, createChat, handleSelectChat],
  );

  const activateItem = useCallback(
    (item: JumpItem) => {
      if (item.kind === 'chat') {
        handleSelectChat(item.chat.id);
      } else {
        void handleSelectUser(item.user);
      }
    },
    [handleSelectChat, handleSelectUser],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (flatItems.length ? Math.min(i + 1, flatItems.length - 1) : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && flatItems.length > 0) {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) activateItem(item);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [open, onClose, flatItems, activeIndex, activateItem]);

  if (!open) return null;

  const showUserLoading = userSearchEnabled && (usersLoading || usersFetching) && matchingUsers.length === 0;

  return (
    <ModalDialog className={styles.overlay} aria-labelledby="jump-to-title" onClose={onClose}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h3 id="jump-to-title">
            <Search size={16} className={styles.headerIcon} />
            Jump to…
          </h3>
          <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            className={styles.input}
            type="search"
            placeholder="Search chats or people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.kbdHint}>Esc</kbd>
        </div>

        <div className={styles.body}>
          {flatItems.length === 0 && !showUserLoading ? (
            <p className={styles.hint}>
              {normalized
                ? 'No matching chats or people.'
                : 'Type to search conversations or find someone new.'}
            </p>
          ) : (
            <>
              {matchingChats.length > 0 && (
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>
                    {normalized ? 'Chats' : 'Recent chats'}
                  </p>
                  <ul className={styles.list}>
                    {matchingChats.map((chat) => {
                      const idx = flatItems.findIndex(
                        (it) => it.kind === 'chat' && it.chat.id === chat.id,
                      );
                      const active = idx === activeIndex;
                      return (
                        <li key={chat.id}>
                          <button
                            type="button"
                            className={`${styles.item} ${active ? styles.itemActive : ''}`}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => handleSelectChat(chat.id)}
                          >
                            {chat.type === 'GROUP' ? (
                              <GroupChannelIcon
                                visibility={chat.groupVisibility}
                                size={18}
                                className={styles.itemIcon}
                              />
                            ) : (
                              <UserAvatar
                                userId={chat.dmPeer?.id}
                                avatarUrl={chat.dmPeer?.avatarUrl}
                                displayName={chat.dmPeer?.displayName}
                                email={chat.dmPeer?.email}
                                className={styles.itemAvatar}
                              />
                            )}
                            <span className={styles.itemLabel}>{getChatLabel(chat)}</span>
                            <span className={styles.itemMeta}>
                              {chat.type === 'GROUP' ? (
                                <>
                                  <Hash size={12} /> Channel
                                </>
                              ) : (
                                <>
                                  <MessageCircle size={12} /> DM
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {normalized && (
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>People</p>
                  {renderPeopleResults(
                    showUserLoading,
                    matchingUsers,
                    creating,
                    flatItems,
                    activeIndex,
                    setActiveIndex,
                    handleSelectUser,
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalDialog>
  );
};

export default JumpToSearch;
