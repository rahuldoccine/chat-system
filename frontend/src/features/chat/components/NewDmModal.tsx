import React, { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useCreateDirectChat, useSearchUsers, type DiscoverableUser } from '../hooks/useChatData';
import styles from './NewDmModal.module.css';

interface NewDmModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

const getUserLabel = (user: DiscoverableUser) =>
  user.displayName || user.username || user.email;

const NewDmModal: React.FC<NewDmModalProps> = ({ onClose, onChatCreated }) => {
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching } = useSearchUsers(query);
  const createChat = useCreateDirectChat();

  const users = data?.data ?? [];
  const showSpinner = isLoading || isFetching;

  const handleSelect = async (user: DiscoverableUser) => {
    try {
      const result = await createChat.mutateAsync(user.id);
      onChatCreated(result.chat.id);
      onClose();
    } catch {
      // axios interceptor handles auth errors
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
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
        <div className={styles.list}>
          {showSpinner && users.length === 0 ? (
            <div className={styles.loading}>
              <Loader2 size={20} className={styles.spinner} />
              <span>Loading people...</span>
            </div>
          ) : users.length === 0 ? (
            <p className={styles.empty}>
              {query.trim()
                ? 'No users match your search.'
                : 'No other users yet. Register another account in a second browser to chat.'}
            </p>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={styles.userRow}
                disabled={createChat.isPending}
                onClick={() => handleSelect(user)}
              >
                <div className={styles.avatar}>
                  {getUserLabel(user).charAt(0).toUpperCase()}
                </div>
                <div className={styles.userMeta}>
                  <span className={styles.name}>{getUserLabel(user)}</span>
                  <span className={styles.email}>{user.email}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NewDmModal;
