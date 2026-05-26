import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ChatSection = 'messages' | 'files' | 'pins' | 'calls';

interface ChatContextType {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Increments whenever a conversation is selected (including re-selecting the same one). */
  chatFocusKey: number;
  activeSection: ChatSection;
  setActiveSection: (section: ChatSection) => void;
  pendingScrollToMessageId: string | null;
  requestScrollToMessage: (messageId: string) => void;
  clearPendingScrollToMessage: () => void;
  isDetailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  drafts: Record<string, string>;
  setDraft: (id: string, text: string) => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  editingMessage: { id: string; text: string } | null;
  setEditingMessage: (msg: { id: string; text: string } | null) => void;
  forwardingMessage: { id: string; text: string; kind?: string; contentMeta?: unknown } | null;
  setForwardingMessage: (msg: { id: string; text: string; kind?: string; contentMeta?: unknown } | null) => void;
  registerScrollToBottom: (fn: (() => void) | null) => void;
  scrollToBottom: () => void;
  activeThreadRootId: string | null;
  openThread: (rootMessageId: string) => void;
  closeThread: () => void;
  threadDrafts: Record<string, string>;
  setThreadDraft: (key: string, text: string) => void;
  alsoSendToMain: boolean;
  setAlsoSendToMain: (value: boolean) => void;
  threadReplyingTo: string | null;
  setThreadReplyingTo: (id: string | null) => void;
  inChatSearchOpen: boolean;
  setInChatSearchOpen: (open: boolean) => void;
  inChatSearchQuery: string;
  setInChatSearchQuery: (query: string) => void;
  inChatSearchMatchIds: string[];
  setInChatSearchMatchIds: (ids: string[]) => void;
  inChatSearchActiveIndex: number;
  setInChatSearchActiveIndex: (index: number) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [chatFocusKey, setChatFocusKey] = useState(0);
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<{
    id: string;
    text: string;
    kind?: string;
    contentMeta?: unknown;
  } | null>(null);
  const [activeSection, setActiveSection] = useState<ChatSection>('messages');
  const [pendingScrollToMessageId, setPendingScrollToMessageId] = useState<string | null>(null);
  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null);
  const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({});
  const [alsoSendToMain, setAlsoSendToMain] = useState(false);
  const [threadReplyingTo, setThreadReplyingTo] = useState<string | null>(null);
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatSearchMatchIds, setInChatSearchMatchIds] = useState<string[]>([]);
  const [inChatSearchActiveIndex, setInChatSearchActiveIndex] = useState(0);
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const clearInChatSearch = useCallback(() => {
    setInChatSearchOpen(false);
    setInChatSearchQuery('');
    setInChatSearchMatchIds([]);
    setInChatSearchActiveIndex(0);
  }, []);

  const openThread = useCallback((rootMessageId: string) => {
    setActiveThreadRootId(rootMessageId);
    setDetailsOpen(false);
    setReplyingTo(null);
    setThreadReplyingTo(null);
  }, []);

  const closeThread = useCallback(() => {
    setActiveThreadRootId(null);
    setAlsoSendToMain(false);
    setThreadReplyingTo(null);
  }, []);

  const setThreadDraft = useCallback((key: string, text: string) => {
    setThreadDrafts((prev) => ({ ...prev, [key]: text }));
  }, []);

  const requestScrollToMessage = useCallback((messageId: string) => {
    setActiveSection('messages');
    setPendingScrollToMessageId(messageId);
  }, []);

  const clearPendingScrollToMessage = useCallback(() => {
    setPendingScrollToMessageId(null);
  }, []);

  const registerScrollToBottom = useCallback((fn: (() => void) | null) => {
    scrollToBottomRef.current = fn;
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollToBottomRef.current?.();
  }, []);

  const setDraft = (id: string, text: string) => {
    setDrafts(prev => ({ ...prev, [id]: text }));
  };

  return (
    <ChatContext.Provider value={{ 
      activeId, 
      chatFocusKey,
      setActiveId: (id) => {
        setActiveIdState(id);
        setReplyingTo(null);
        setEditingMessage(null);
        setForwardingMessage(null);
        setActiveSection('messages');
        setPendingScrollToMessageId(null);
        setActiveThreadRootId(null);
        setAlsoSendToMain(false);
        setThreadReplyingTo(null);
        clearInChatSearch();
        if (id) setChatFocusKey((k) => k + 1);
      },
      activeSection,
      setActiveSection,
      pendingScrollToMessageId,
      requestScrollToMessage,
      clearPendingScrollToMessage,
      isDetailsOpen, 
      setDetailsOpen,
      drafts,
      setDraft,
      replyingTo,
      setReplyingTo,
      editingMessage,
      setEditingMessage,
      forwardingMessage,
      setForwardingMessage,
      registerScrollToBottom,
      scrollToBottom,
      activeThreadRootId,
      openThread,
      closeThread,
      threadDrafts,
      setThreadDraft,
      alsoSendToMain,
      setAlsoSendToMain,
      threadReplyingTo,
      setThreadReplyingTo,
      inChatSearchOpen,
      setInChatSearchOpen,
      inChatSearchQuery,
      setInChatSearchQuery,
      inChatSearchMatchIds,
      setInChatSearchMatchIds,
      inChatSearchActiveIndex,
      setInChatSearchActiveIndex,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
