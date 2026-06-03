import React, { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCreateDirectChat, useSearchUsers, type DiscoverableUser } from '../hooks/useChatData';
import { invalidateUsersSearch } from '../utils/invalidateChatCaches';
import UserAvatar from './UserAvatar';
import EmptyState from './EmptyState';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './NewDmModal.module.css';

interface NewDmModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

const getUserLabel = (user: DiscoverableUser) =>
  user.displayName || user.username || user.email;

const NewDmModal: React.FC<NewDmModalProps> = ({ onClose, onChatCreated }) => {
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useSearchUsers(query);
  const createChat = useCreateDirectChat();

  useEffect(() => {
    void invalidateUsersSearch(queryClient);
  }, [queryClient]);

  const users = data?.data ?? [];
  const showSpinner = isLoading || isFetching;

  const handleSelect = async (user: DiscoverableUser) => {
    try {
      const result = await createChat.mutateAsync(user.id);
      onChatCreated(result.chat.id);
      onClose();
    } catch {
      toast.error('Could not start this chat. The user list was refreshed — try again.');
    }
  };

  const renderUserList = () => {
    if (showSpinner && users.length === 0) {
      return (
        <div className={styles.loading}>
          <Loader2 size={20} className={styles.spinner} />
          <span>Loading people...</span>
        </div>
      );
    }
    if (users.length === 0) {
      return (
        <EmptyState
          compact
          title={query.trim() ? 'No users found' : 'No other users yet'}
          hint={
            query.trim()
              ? 'Try a different name or email.'
              : 'Register another account in a second browser to chat.'
          }
        />
      );
    }
    return users.map((user) => (
      <button
        key={user.id}
        type="button"
        className={styles.userRow}
        disabled={createChat.isPending}
        onClick={() => handleSelect(user)}
      >
        <UserAvatar
          userId={user.id}
          avatarUrl={user.avatarUrl}
          displayName={user.displayName}
          email={user.email}
          className={styles.avatar}
          fallbackFontSize="0.95rem"
        />
        <div className={styles.userMeta}>
          <span className={styles.name}>{getUserLabel(user)}</span>
          <span className={styles.email}>{user.email}</span>
        </div>
      </button>
    ));
  };

  return (
    <ModalDialog className={styles.overlay} aria-label="Start a direct message" onClose={onClose}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>Start a direct message</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className={styles.searchRow}>
          <Search size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            autoFocus
          />
        </div>
        <div className={styles.list}>{renderUserList()}</div>
      </div>
    </ModalDialog>
  );
};

export default NewDmModal;
