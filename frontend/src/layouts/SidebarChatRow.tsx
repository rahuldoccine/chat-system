import type { MouseEvent } from 'react';
import { MoreHorizontal, Star, BellOff } from 'lucide-react';
import GroupChannelIcon from '../features/chat/components/GroupChannelIcon';
import UserAvatar from '../features/chat/components/UserAvatar';
import { isChatMuted } from '../features/chat/utils/mute';
import type { Chat } from '../features/chat/types';
import styles from './MainLayout.module.css';

export type SidebarChatRowProps = Readonly<{
  chat: Chat;
  variant: 'dm' | 'group';
  active: boolean;
  menuOpen: boolean;
  isOnline?: boolean;
  chatName: string;
  groupVisibilityLabel?: string;
  formatUnread: (count: number) => string;
  onSelect: () => void;
  onOpenMenu: (e: MouseEvent) => void;
}>;

export function SidebarChatRow({
  chat,
  variant,
  active,
  menuOpen,
  isOnline,
  chatName,
  groupVisibilityLabel,
  formatUnread,
  onSelect,
  onOpenMenu,
}: SidebarChatRowProps) {
  const moreLabel =
    variant === 'dm' ? `DM settings for ${chatName}` : `Channel settings for ${chatName}`;

  return (
    <div
      className={`${styles.dmRowWrap} ${active ? styles.dmRowActive : ''} ${menuOpen ? styles.dmRowMenuOpen : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={onOpenMenu}
        className={styles.navItem}
        {...(variant === 'group' && groupVisibilityLabel
          ? { 'aria-label': `${chatName} — ${groupVisibilityLabel}`, title: groupVisibilityLabel }
          : {})}
      >
        {variant === 'dm' ? (
          <UserAvatar
            userId={chat.dmPeer?.id}
            avatarUrl={chat.dmPeer?.avatarUrl}
            displayName={chat.dmPeer?.displayName}
            email={chat.dmPeer?.email}
            className={styles.miniAvatar}
          />
        ) : (
          <GroupChannelIcon
            visibility={chat.groupVisibility}
            size={18}
            strokeWidth={2.5}
            className={styles.channelAvatar}
          />
        )}
        <span className={styles.navLabel}>{chatName}</span>
        {chat.favoritedAt && (
          <Star size={12} className={styles.favoriteStar} aria-label="Favorite" />
        )}
        {variant === 'dm' && isChatMuted(chat.mutedUntil) && (
          <BellOff size={14} className={styles.mutedIcon} aria-label="Muted" />
        )}
        {variant === 'dm' && isOnline && <span className={styles.onlineDot} />}
        {chat.unreadMentionCount != null && chat.unreadMentionCount > 0 && (
          <span className={styles.mentionBadge} aria-label="Unread mentions">
            @
          </span>
        )}
        {chat.unreadCount > 0 && (
          <span className={styles.unreadBadge}>{formatUnread(chat.unreadCount)}</span>
        )}
        {chat.unreadCount > 0 && <span className={styles.unreadDot} aria-hidden />}
        {chat.pinnedAt && (
          <span className={styles.pinIcon} aria-label="Pinned">
            📌
          </span>
        )}
      </button>
      <button
        type="button"
        className={styles.dmMoreBtn}
        aria-label={moreLabel}
        onClick={onOpenMenu}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}
