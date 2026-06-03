import React, { useEffect, useRef } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './ChatSearchDialog.module.css';
import {
  useChatMessageSearch,
  useE2eeChatMessageSearch,
  type SearchMessageHit,
} from '../hooks/useChatMessageSearch';
import { formatChatTimestamp } from '../../../utils/timeFormat';

type ChatSearchDialogProps = Readonly<{
  chatId: string;
  open: boolean;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
  /** When true, search runs on decrypted messages loaded in this chat (E2EE). */
  e2eeSearch?: boolean;
}>;

function senderLabel(hit: SearchMessageHit): string {
  return hit.sender.displayName || hit.sender.username || hit.sender.email || 'User';
}

function ChatSearchBody({
  query,
  serverUnavailable,
  showLoading,
  hits,
  e2eeSearch,
  isFetching,
  onSelectMessage,
  onClose,
}: Readonly<{
  query: string;
  serverUnavailable: boolean;
  showLoading: boolean;
  hits: SearchMessageHit[];
  e2eeSearch: boolean;
  isFetching: boolean;
  onSelectMessage: (messageId: string) => void;
  onClose: () => void;
}>): React.ReactNode {
  if (query.trim().length === 0) {
    return <p className={styles.hint}>Type to search messages in this conversation.</p>;
  }
  if (serverUnavailable) {
    return (
      <p className={styles.unavailable}>
        Search isn&apos;t available in encrypted chats. Messages are stored securely on your devices only.
      </p>
    );
  }
  if (showLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={18} className={styles.spinner} />
        Searching…
      </div>
    );
  }
  if (hits.length === 0) {
    const emptyMessage =
      e2eeSearch && isFetching ? 'Loading older messages…' : 'No messages match your search.';
    return <p className={styles.empty}>{emptyMessage}</p>;
  }
  return (
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
  );
}

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

  return (
    <ModalDialog className={styles.overlay} aria-labelledby="chat-search-title" onClose={onClose}>
      <div className={styles.modal}>
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
          <ChatSearchBody
            query={query}
            serverUnavailable={serverUnavailable}
            showLoading={showLoading}
            hits={hits}
            e2eeSearch={e2eeSearch}
            isFetching={isFetching}
            onSelectMessage={onSelectMessage}
            onClose={onClose}
          />
        </div>
      </div>
    </ModalDialog>
  );
};

export default ChatSearchDialog;
