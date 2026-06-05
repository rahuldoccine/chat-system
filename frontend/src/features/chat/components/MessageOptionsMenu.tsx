import React, { useEffect, useRef } from 'react';
import styles from './MessageOptionsMenu.module.css';
import { Copy, Pencil, Trash2, Pin, PinOff, Forward } from 'lucide-react';
import type { Message } from '../types';
import type { DecryptedBody } from '../utils/messageBody';
import { canCopyMessage, canEditMessage, getMessageCopyText } from '../utils/messageCache';

export type MessageMenuAction = 'copy' | 'edit' | 'delete' | 'pin' | 'unpin' | 'forward';

type MessageOptionsMenuProps = {
  message: Message;
  isMe: boolean;
  isPinned: boolean;
  canPin?: boolean;
  userId?: string;
  canModerateDelete?: boolean;
  decryptedBodies?: Record<string, DecryptedBody>;
  /** Plain preview text for copy. */
  copyText?: string;
  onAction: (action: MessageMenuAction) => void;
  onClose: () => void;
};

const MessageOptionsMenu: React.FC<MessageOptionsMenuProps> = ({
  message,
  isMe,
  isPinned,
  canPin = true,
  userId,
  canModerateDelete = false,
  decryptedBodies,
  copyText: copyTextProp,
  onAction,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const copyText = copyTextProp ?? getMessageCopyText(message, decryptedBodies, userId);
  const showCopy =
    canCopyMessage(message, decryptedBodies, userId) &&
    copyText.length > 0;
  const showEdit = canEditMessage(message, userId, decryptedBodies);
  const showDelete = isMe || canModerateDelete;

  const run = (action: MessageMenuAction) => {
    onAction(action);
    onClose();
  };

  return (
    <div className={`${styles.menu} ${isMe ? styles.menuMe : ''}`} ref={ref} role="menu" tabIndex={-1}>
      {showCopy && (
        <button type="button" className={styles.item} role="menuitem" onClick={() => run('copy')}>
          <Copy size={16} />
          <span>Copy</span>
        </button>
      )}
      {showEdit && (
        <button type="button" className={styles.item} role="menuitem" onClick={() => run('edit')}>
          <Pencil size={16} />
          <span>Edit</span>
        </button>
      )}
      {showDelete && (
        <button type="button" className={`${styles.item} ${styles.danger}`} role="menuitem" onClick={() => run('delete')}>
          <Trash2 size={16} />
          <span>Delete</span>
        </button>
      )}
      {canPin &&
        (isPinned ? (
          <button type="button" className={styles.item} role="menuitem" onClick={() => run('unpin')}>
            <PinOff size={16} />
            <span>Unpin</span>
          </button>
        ) : (
          <button type="button" className={styles.item} role="menuitem" onClick={() => run('pin')}>
            <Pin size={16} />
            <span>Pin</span>
          </button>
        ))}
      <button type="button" className={styles.item} role="menuitem" onClick={() => run('forward')}>
        <Forward size={16} />
        <span>Forward</span>
      </button>
    </div>
  );
};

export default MessageOptionsMenu;
