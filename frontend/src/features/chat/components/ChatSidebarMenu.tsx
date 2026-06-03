import React from 'react';
import { LogOut, Star, XCircle } from 'lucide-react';
import { stopPropagationKeyboard } from '../../../utils/a11y';
import styles from './DmContextMenu.module.css';

export type ChatSidebarMenuProps = {
  variant: 'dm' | 'group';
  x: number;
  y: number;
  favorited: boolean;
  closed?: boolean;
  onFavorite: () => void;
  onCloseDm?: () => void;
  onLeaveGroup?: () => void;
  onDismiss: () => void;
};

const ChatSidebarMenu: React.FC<ChatSidebarMenuProps> = ({
  variant,
  x,
  y,
  favorited,
  closed = false,
  onFavorite,
  onCloseDm,
  onLeaveGroup,
  onDismiss,
}) => (
  <div
    className={styles.menu}
    style={{ top: y, left: x }}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={stopPropagationKeyboard}
    role="menu"
    tabIndex={-1}
  >
    <button type="button" className={styles.item} onClick={onFavorite} role="menuitem">
      <Star size={16} className={favorited ? styles.starFilled : undefined} />
      <span>{favorited ? 'Remove from favorites' : 'Favorite'}</span>
    </button>
    {variant === 'dm' ? (
      <button type="button" className={styles.item} onClick={onCloseDm} role="menuitem">
        <XCircle size={16} />
        <div className={styles.itemText}>
          <span>{closed ? 'Reopen DM' : 'Close DM'}</span>
          {!closed && (
            <span className={styles.hint}>Will reappear with new messages</span>
          )}
        </div>
      </button>
    ) : (
      <button type="button" className={styles.item} onClick={onLeaveGroup} role="menuitem">
        <LogOut size={16} />
        <div className={styles.itemText}>
          <span>Leave group</span>
          <span className={styles.hint}>You can rejoin if the group is public</span>
        </div>
      </button>
    )}
    <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Close menu" />
  </div>
);

export default ChatSidebarMenu;
