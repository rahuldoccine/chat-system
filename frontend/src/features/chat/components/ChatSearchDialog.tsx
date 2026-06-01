import React, { useEffect, useRef } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import styles from './ChatSearchDialog.module.css';
import { useChatMessageSearch, useE2eeChatMessageSearch } from '../hooks/useChatMessageSearch';
import { formatChatTimestamp } from '../../../utils/timeFormat';

type ChatSearchDialogProps = {
  chatId: string;
  open: boolean;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
  /** When true, search runs on decrypted messages loaded in this chat (E2EE). */
  e2eeSearch?: boolean;
};

const ChatSearchDialog: React.FC<ChatSearchDialogProps> = ({
  chatId,
  open,
  onClose,
  onSelectMessage,
  e2eeSearch = false,
}) => {
  const [query, setQuery] = React.useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const serverSearch = useChatMessageSearch(chatId, query, open && !e2eeSearch);
  const clientSearch = useE2eeChatMessageSearch(chatId, query, open && e2eeSearch);
  const { data, isLoading, isFetching } = e2eeSearch ? clientSearch : serverSearch;

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hits = data?.data ?? [];
  const showLoading = (isLoading || isFetching) && query.trim().length > 0;
  const serverUnavailable = !e2eeSearch && data?.searchUnavailable === true;

  const senderLabel = (hit: (typeof hits)[0]) =>
    hit.sender.displayName || hit.sender.username || hit.sender.email || 'User';

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-search-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h3 id="chat-search-title">
            <Search size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Search in chat
          </h3>
          <button type="button" className={styles.closeBtn} aria-label="Close search" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            className={styles.input}
            type="search"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.body}>
          {query.trim().length === 0 ? (
            <p className={styles.hint}>Type to search messages in this conversation.</p>
          ) : serverUnavailable ? (
            <p className={styles.unavailable}>
              Search isn&apos;t available in encrypted chats. Messages are stored securely on your devices only.
            </p>
          ) : showLoading ? (
            <div className={styles.loading}>
              <Loader2 size={18} className={styles.spinner} />
              Searching…
            </div>
          ) : hits.length === 0 ? (
            <p className={styles.empty}>
              {e2eeSearch && isFetching
                ? 'Loading older messages…'
                : 'No messages match your search.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {hits.map((hit) => (
                <li key={hit.messageId}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => {
                      onSelectMessage(hit.messageId);
                      onClose();
                    }}
                  >
                    <div className={styles.itemMeta}>
                      <span className={styles.sender}>{senderLabel(hit)}</span>
                      <time dateTime={hit.createdAt}>{formatChatTimestamp(hit.createdAt)}</time>
                    </div>
                    <span className={styles.snippet}>{hit.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSearchDialog;
