import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import styles from './ChatInMessageSearch.module.css';
import { useChat } from '../../../context/ChatContext';
import { useChatMessageSearch, useE2eeChatMessageSearch } from '../hooks/useChatMessageSearch';

const SEARCH_LIMIT = 50;

type ChatInMessageSearchProps = {
  chatId: string;
  e2eeSearch?: boolean;
};

const ChatInMessageSearch: React.FC<ChatInMessageSearchProps> = ({
  chatId,
  e2eeSearch = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    inChatSearchOpen,
    setInChatSearchOpen,
    inChatSearchQuery,
    setInChatSearchQuery,
    setInChatSearchMatchIds,
    inChatSearchActiveIndex,
    setInChatSearchActiveIndex,
    requestScrollToMessage,
  } = useChat();

  const serverSearch = useChatMessageSearch(
    chatId,
    inChatSearchQuery,
    inChatSearchOpen && !e2eeSearch,
    SEARCH_LIMIT,
  );
  const clientSearch = useE2eeChatMessageSearch(
    chatId,
    inChatSearchQuery,
    inChatSearchOpen && e2eeSearch,
    SEARCH_LIMIT,
  );
  const { data, isLoading, isFetching } = e2eeSearch ? clientSearch : serverSearch;

  const hits = data?.data ?? [];
  const matchIds = hits.map((h) => h.messageId);
  const total = matchIds.length;
  const query = inChatSearchQuery.trim();
  const serverUnavailable = !e2eeSearch && data?.searchUnavailable === true;
  const showLoading = (isLoading || isFetching) && query.length > 0;

  const close = useCallback(() => {
    setInChatSearchOpen(false);
    setInChatSearchQuery('');
    setInChatSearchMatchIds([]);
    setInChatSearchActiveIndex(0);
  }, [
    setInChatSearchOpen,
    setInChatSearchQuery,
    setInChatSearchMatchIds,
    setInChatSearchActiveIndex,
  ]);

  const goToIndex = useCallback(
    (index: number) => {
      if (!matchIds.length) return;
      const next = Math.max(0, Math.min(matchIds.length - 1, index));
      setInChatSearchActiveIndex(next);
      requestScrollToMessage(matchIds[next]!);
    },
    [matchIds, requestScrollToMessage, setInChatSearchActiveIndex],
  );

  const lastScrolledQueryRef = useRef('');

  useEffect(() => {
    if (!inChatSearchOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [inChatSearchOpen]);

  useEffect(() => {
    if (!inChatSearchOpen || !query) {
      lastScrolledQueryRef.current = '';
      setInChatSearchMatchIds([]);
      setInChatSearchActiveIndex(0);
      return;
    }
    if (showLoading) return;

    setInChatSearchMatchIds(matchIds);

    if (lastScrolledQueryRef.current !== query) {
      lastScrolledQueryRef.current = query;
      setInChatSearchActiveIndex(0);
      if (matchIds[0]) requestScrollToMessage(matchIds[0]);
    }
  }, [
    inChatSearchOpen,
    query,
    showLoading,
    matchIds,
    setInChatSearchMatchIds,
    setInChatSearchActiveIndex,
    requestScrollToMessage,
  ]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (!query || !total) return;

    /* Index 0 = newest (bottom). ↑ = older (scroll up), ↓ = newer (scroll down). */
    if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      goToIndex(inChatSearchActiveIndex + 1);
    } else if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      goToIndex(inChatSearchActiveIndex - 1);
    }
  };

  if (!inChatSearchOpen) return null;

  const statusLabel = serverUnavailable
    ? 'Unavailable'
    : showLoading
      ? 'Searching…'
      : total === 0
        ? query
          ? '0 results'
          : ''
        : total === 1
          ? '1 result'
          : `${total} results`;

  const positionLabel =
    total > 0 ? `${inChatSearchActiveIndex + 1} of ${total}` : '';

  return (
    <div className={styles.bar} role="search">
      <div className={styles.inputWrap}>
        <Search size={16} className={styles.searchIcon} aria-hidden />
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          placeholder='Search messages…'
          value={inChatSearchQuery}
          onChange={(e) => setInChatSearchQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search in chat"
        />
      </div>

      {statusLabel ? (
        <span className={styles.status} aria-live="polite">
          {statusLabel}
        </span>
      ) : null}

      {positionLabel ? (
        <span className={styles.status} aria-live="polite">
          {positionLabel}
        </span>
      ) : null}

      {showLoading && <Loader2 size={16} className={styles.searchIcon} aria-hidden />}

      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Older match (scroll up)"
          disabled={!total || inChatSearchActiveIndex >= total - 1}
          onClick={() => goToIndex(inChatSearchActiveIndex + 1)}
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Newer match (scroll down)"
          disabled={!total || inChatSearchActiveIndex <= 0}
          onClick={() => goToIndex(inChatSearchActiveIndex - 1)}
        >
          <ChevronDown size={18} />
        </button>
        <button type="button" className={styles.closeBtn} aria-label="Close search" onClick={close}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default ChatInMessageSearch;
