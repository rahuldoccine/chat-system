import { useState, useCallback, useRef, useMemo, useId } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { GifResult } from '../utils/gifPicker';
import { useChat } from '../../../context/ChatContext';
import {
  useSendMessage,
  useMessages,
  useThreadMessages,
  useEditMessage,
  useCreatePoll,
  useConversations,
} from '../hooks/useChatData';
import { useAuth } from '../../../context/AuthContext';
import { fetchGroup } from '../api/groupsApi';
import { useMessageBodies } from '../utils/messageBody';
import { getMessagePreviewText } from '../utils/messagePreview';
import { useUpload } from '../hooks/useUpload';
import { useSocket } from '../../../context/SocketContext';
import { useIsMobile } from '../../../hooks/useBreakpoint';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useLinkPreview } from '../hooks/useLinkPreview';
import type { LinkDisplayMode, LinkPreviewMeta, Message } from '../types';
import {
  extractFirstHttpUrl,
  resolveComposerLinkPreview,
  withLinkDisplay,
} from '../utils/linkPreviewUtils';
import { useComposerMentions } from '../hooks/useComposerMentions';
import { roleAtLeast } from '../utils/groupRoles';
import {
  type ComposerAlert,
} from './messageComposer.helpers';
import {
  runComposerGifSelect,
  runComposerPollSubmit,
  runComposerSendAction,
} from './messageComposer.actions';
import { useMessageComposerEffects } from './useMessageComposerEffects';
import { useMessageComposerInput } from './useMessageComposerInput';
import { useMessageComposerVoice } from './useMessageComposerVoice';

export type MessageComposerModelProps = {
  variant?: 'main' | 'thread';
  threadRootId?: string;
};

export type MessageComposerModel = {
  activeId: string | null;
  isThread: boolean;
  keyboardInset: number;
  showPollModal: boolean;
  setShowPollModal: (v: boolean) => void;
  isCreatingPoll: boolean;
  handlePollSubmit: (data: {
    question: string;
    closesAt: string | null;
    options: string[];
  }) => Promise<void>;
  alert: ComposerAlert | null;
  setAlert: (v: ComposerAlert | null) => void;
  isMobile: boolean;
  showPlusMenu: boolean;
  showGifPicker: boolean;
  showEmojiPicker: boolean;
  closeComposerMenus: () => void;
  editingMessage: { id: string; text: string } | null;
  setEditingMessage: (m: { id: string; text: string } | null) => void;
  replyTarget: Message | undefined;
  replyPreviewText: string;
  setReplyingTo: (id: string | null) => void;
  threadReplyTarget: Message | undefined;
  threadReplyPreviewText: string;
  setThreadReplyingTo: (id: string | null) => void;
  voice: ReturnType<typeof useVoiceRecorder>;
  cancelRecording: () => void;
  composerPreview: LinkPreviewMeta | null;
  linkDisplayAs: LinkDisplayMode;
  isLinkPreviewFetching: boolean;
  setLinkDisplayAs: (mode: LinkDisplayMode) => void;
  setPreviewDismissed: (v: boolean) => void;
  attachments: File[];
  isUploading: boolean;
  uploadProgress: { current: number; total: number } | null;
  progress: number;
  removeAttachmentAt: (index: number) => void;
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  alsoSendCheckboxId: string;
  alsoSendToMain: boolean;
  setAlsoSendToMain: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  plusMenuRef: React.RefObject<HTMLDivElement | null>;
  showPlusMenuToggle: () => void;
  editingMessageBlocksPlus: boolean;
  openFilePicker: () => void;
  openGifPicker: () => void;
  openPollModal: () => void;
  isThreadBlocksPoll: boolean;
  handleGifSelect: (gif: GifResult) => void;
  setShowGifPicker: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  text: string;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  voiceBusy: boolean;
  mentionOpen: boolean;
  mentionCandidates: { key: string; handle: string; label: string }[];
  mentionMenuRef: React.RefObject<HTMLDivElement | null>;
  mentionIndex: number;
  setMentionIndex: (index: number) => void;
  applyMention: (handle: string) => void;
  micBtnRef: React.RefObject<HTMLButtonElement | null>;
  handleMicPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  handleMicPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  handleMicPointerLeave: () => void;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  closeMenusForEmoji: () => void;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>;
  handleEmojiClick: (emojiObject: { emoji: string }) => void;
  handleSend: () => void;
  isSending: boolean;
  isSavingEdit: boolean;
};

export function useMessageComposerModel({
  variant = 'main',
  threadRootId,
}: MessageComposerModelProps): MessageComposerModel {
  const isThread = variant === 'thread';
  const {
    activeId,
    drafts,
    setDraft,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    scrollToBottom,
    threadDrafts,
    setThreadDraft,
    alsoSendToMain,
    setAlsoSendToMain,
    threadReplyingTo,
    setThreadReplyingTo,
  } = useChat();
  const threadDraftKey =
    isThread && activeId && threadRootId ? `${activeId}:${threadRootId}` : null;
  const threadSendMeta =
    isThread && threadRootId
      ? { threadRootId, broadcastToChannel: alsoSendToMain }
      : {};
  const { socket } = useSocket();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [alert, setAlert] = useState<ComposerAlert | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const isMobile = useIsMobile();
  const alsoSendCheckboxId = useId();

  const showAlert = useCallback((title: string, description: string) => {
    setAlert({ title, description });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const voice = useVoiceRecorder();

  const { user } = useAuth();
  const { data: conversationsData } = useConversations();
  const activeChat = conversationsData?.data?.find((c) => c.id === activeId);
  const dmPeerId = activeChat?.type === 'DIRECT' ? activeChat.dmPeer?.id : undefined;
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => {
      if (!activeId) throw new Error('Group query requires active chat id');
      return fetchGroup(activeId);
    },
    enabled: Boolean(activeId && activeChat?.type === 'GROUP'),
  });
  const sendCtx = {
    chat: activeChat ?? null,
    peerUserId: dmPeerId,
    groupMemberIds: groupDetails?.members.map((m) => m.userId),
  };

  const { mutateAsync: sendMessageAsync, isPending: isSending } = useSendMessage();
  const { mutateAsync: createPollAsync, isPending: isCreatingPoll } = useCreatePoll();
  const { mutate: editMessage, isPending: isSavingEdit } = useEditMessage();
  const { uploadFile, progress, status: uploadStatus, reset: resetUpload } = useUpload();

  const uploadForChat = useCallback(
    async (file: File, options?: { voiceNote?: boolean }) => {
      const uploadResult = await uploadFile(file, activeId ?? undefined, options);
      return { uploadResult };
    },
    [activeId, uploadFile],
  );
  const { data: messages } = useMessages(activeId);
  const { data: threadData } = useThreadMessages(
    isThread ? activeId : null,
    isThread ? threadRootId ?? null : null,
  );
  const decryptedBodies = useMessageBodies(messages);
  const threadAllMessages = useMemo(() => {
    if (!threadData?.root) return [];
    return [threadData.root, ...(threadData.replies ?? [])];
  }, [threadData]);
  const threadDecryptedBodies = useMessageBodies(isThread ? threadAllMessages : undefined);

  const queryClient = useQueryClient();
  const { mentionCandidates } = useComposerMentions(
    text,
    editingMessage,
    activeChat?.type,
    groupDetails,
    user?.id,
  );
  const canUseAllMention = roleAtLeast(groupDetails?.myRole ?? 'MEMBER', 'ADMIN');
  const replyTarget = messages?.find((m) => m.id === replyingTo);
  const threadReplyTarget = isThread
    ? threadAllMessages.find((m) => m.id === threadReplyingTo)
    : undefined;
  const replyPreviewText = replyTarget
    ? getMessagePreviewText(replyTarget, decryptedBodies, user?.id)
    : '';
  const threadReplyPreviewText = threadReplyTarget
    ? getMessagePreviewText(threadReplyTarget, threadDecryptedBodies, user?.id)
    : '';
  const urlInText = useMemo(() => extractFirstHttpUrl(text), [text]);
  const linkPreviewEnabled =
    !editingMessage &&
    attachments.length === 0 &&
    !voice.isRecording &&
    Boolean(urlInText) &&
    true;
  const { data: linkPreviewData, isFetching: isLinkPreviewFetching } = useLinkPreview(
    urlInText,
    linkPreviewEnabled,
  );
  const [linkDisplayAs, setLinkDisplayAs] = useState<LinkDisplayMode>('inline');
  const [previewDismissed, setPreviewDismissed] = useState(false);

  const composerPreviewRaw = resolveComposerLinkPreview(
    previewDismissed,
    linkPreviewData?.preview,
    urlInText,
  );
  const composerPreview = composerPreviewRaw
    ? withLinkDisplay(composerPreviewRaw, linkDisplayAs)
    : null;

  const closeComposerMenus = useCallback(() => {
    setShowPlusMenu(false);
    setShowGifPicker(false);
    setShowEmojiPicker(false);
  }, []);

  const handleSend = () =>
    runComposerSendAction({
      activeId,
      isThread,
      threadRootId,
      isSending,
      isSavingEdit,
      uploadStatus,
      isRecording: voice.isRecording,
      threadSendMeta,
      sendCtx,
      editingMessage,
      text,
      attachments,
      replyingTo,
      composerPreview,
      linkDisplayAs,
      activeChat,
      groupMembers: groupDetails?.members,
      canUseAllMention,
      sendMessageAsync: (args) => sendMessageAsync(args as Parameters<typeof sendMessageAsync>[0]),
      editMessage: (args, opts) =>
        editMessage(args as Parameters<typeof editMessage>[0], opts),
      uploadForChat,
      queryClient,
      scrollToBottom,
      showAlert,
      setUploadProgress,
      resetUpload,
      setEditingMessage,
      setText,
      setDraft,
      setAttachments: (files) => setAttachments(files),
      threadDraftKey,
      setThreadDraft,
      drafts,
      setReplyingTo,
      setThreadReplyingTo,
      setPreviewDismissed,
      setLinkDisplayAs,
      setShowEmojiPicker,
      socket,
      focusInput: () => inputRef.current?.focus(),
    });

  const keyboardInset = useMessageComposerEffects({
    urlInText,
    setPreviewDismissed,
    setLinkDisplayAs,
    editingMessage,
    setText,
    setAttachments,
    inputRef,
    activeId,
    drafts,
    threadDrafts,
    threadDraftKey,
    isThread,
    voiceError: voice.error,
    voiceState: voice.state,
    showEmojiPicker,
    showPlusMenu,
    showGifPicker,
    mentionOpen,
    setShowEmojiPicker,
    setShowPlusMenu,
    setShowGifPicker,
    setMentionOpen,
    setMentionIndex,
    emojiPickerRef,
    plusMenuRef,
    mentionMenuRef,
    mentionCandidatesLength: mentionCandidates.length,
  });

  const {
    handleChange,
    handlePaste,
    handleEmojiClick,
    addFiles,
    handleKeyDown,
    applyMention,
  } = useMessageComposerInput({
    text,
    setText,
    activeId,
    editingMessage,
    isThread,
    threadDraftKey,
    setDraft,
    setThreadDraft,
    attachmentsLength: attachments.length,
    setPreviewDismissed,
    queryClient,
    inputRef,
    mentionOpen,
    mentionCandidates,
    mentionIndex,
    setMentionIndex,
    setMentionOpen,
    showAlert,
    setAttachments,
    socket,
    onSend: handleSend,
  });

  const {
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    cancelRecording,
  } = useMessageComposerVoice({
    activeId,
    editingMessage,
    uploadStatus,
    isSending,
    isSavingEdit,
    isThread,
    replyingTo,
    sendCtx,
    threadSendMeta,
    voice,
    uploadForChat,
    sendMessageAsync: (args) => sendMessageAsync(args as Parameters<typeof sendMessageAsync>[0]),
    scrollToBottom,
    setReplyingTo,
    setShowEmojiPicker,
    setShowPlusMenu,
    setUploadProgress,
    resetUpload,
    socket,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachmentAt = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const openFilePicker = () => {
    setShowPlusMenu(false);
    setShowGifPicker(false);
    fileInputRef.current?.click();
  };

  const openGifPicker = () => {
    setShowPlusMenu(false);
    setShowGifPicker(true);
  };

  const openPollModal = () => {
    setShowPlusMenu(false);
    setShowGifPicker(false);
    setShowPollModal(true);
  };

  const handlePollSubmit = (data: {
    question: string;
    closesAt: string | null;
    options: string[];
  }) =>
    runComposerPollSubmit({
      activeId,
      data,
      createPollAsync: (args) => createPollAsync(args as Parameters<typeof createPollAsync>[0]),
      userId: user?.id,
      activeChat,
      dmPeerId,
      setShowPollModal,
      setReplyingTo,
      scrollToBottom,
    });

  const isUploading = uploadStatus === 'uploading';
  const voiceBusy = isUploading || voice.isRecording;

  const handleGifSelect = (gif: GifResult) =>
    runComposerGifSelect(gif, {
      activeId,
      editingMessage,
      isUploading,
      isThread,
      replyingTo,
      sendCtx,
      threadSendMeta,
      setShowGifPicker,
      setUploadProgress,
      uploadForChat,
      showAlert,
      sendMessageAsync: (args) => sendMessageAsync(args as Parameters<typeof sendMessageAsync>[0]),
      scrollToBottom,
      setReplyingTo,
      resetUpload,
    });

  const showPlusMenuToggle = () => {
    setShowEmojiPicker(false);
    setShowPlusMenu((open) => !open);
    if (showPlusMenu) setShowGifPicker(false);
  };

  const closeMenusForEmoji = () => {
    setShowPlusMenu(false);
    setShowGifPicker(false);
  };

  return {
    activeId,
    isThread,
    keyboardInset,
    showPollModal,
    setShowPollModal,
    isCreatingPoll,
    handlePollSubmit,
    alert,
    setAlert,
    isMobile,
    showPlusMenu,
    showGifPicker,
    showEmojiPicker,
    closeComposerMenus,
    editingMessage,
    setEditingMessage,
    replyTarget,
    replyPreviewText,
    setReplyingTo,
    threadReplyTarget,
    threadReplyPreviewText,
    setThreadReplyingTo,
    voice,
    cancelRecording,
    composerPreview,
    linkDisplayAs,
    isLinkPreviewFetching,
    setLinkDisplayAs,
    setPreviewDismissed,
    attachments,
    isUploading,
    uploadProgress,
    progress,
    removeAttachmentAt,
    setAttachments,
    alsoSendCheckboxId,
    alsoSendToMain,
    setAlsoSendToMain,
    fileInputRef,
    handleFileChange,
    plusMenuRef,
    showPlusMenuToggle,
    editingMessageBlocksPlus: Boolean(editingMessage),
    openFilePicker,
    openGifPicker,
    openPollModal,
    isThreadBlocksPoll: isThread,
    handleGifSelect,
    setShowGifPicker,
    inputRef,
    text,
    handleChange,
    handlePaste,
    handleKeyDown,
    voiceBusy,
    mentionOpen,
    mentionCandidates,
    mentionMenuRef,
    mentionIndex,
    setMentionIndex,
    applyMention,
    micBtnRef,
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    emojiPickerRef,
    closeMenusForEmoji,
    setShowEmojiPicker,
    handleEmojiClick,
    handleSend,
    isSending,
    isSavingEdit,
  };
}
