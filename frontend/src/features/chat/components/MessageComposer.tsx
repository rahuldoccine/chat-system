import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import styles from './MessageComposer.module.css';
import {
  Send,
  Plus,
  Paperclip,
  Smile,
  Loader2,
  X,
  Reply,
  File,
  Image as ImageIcon,
  Pencil,
  Film,
  Mic,
  BarChart2,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';
import GifPickerPanel from './GifPickerPanel';
import { gifToFile, type GifResult } from '../utils/gifPicker';
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
import { isDmE2eeChat } from '../../e2ee/chatE2ee';
import { useQuery } from '@tanstack/react-query';
import { fetchGroup } from '../api/groupsApi';
import { parseMentionsFromText } from '../utils/mentions';
import { encryptFileBlob } from '../../e2ee/attachmentCrypto';
import type { E2eeFileAttachmentKeys } from '../../e2ee/attachmentCrypto';
import { E2eePeerNotReadyError } from '../../e2ee/directChat';
import { E2eeKeysLockedError } from '../../e2ee/bootstrap';
import { useMessageBodies } from '../../e2ee/useMessageBodies';
import { getMessagePreviewText } from '../utils/messagePreview';
import { getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import CreatePollModal from './CreatePollModal';
import { useUpload } from '../hooks/useUpload';
import { useSocket } from '../../../context/SocketContext';
import { debounce } from 'lodash-es';
import EmojiPicker from 'emoji-picker-react';
import { truncateFilenameMiddle } from '../utils/formatFilename';
import { env, allowedFileAcceptAttribute } from '../../../config/env';
import { useIsMobile } from '../../../hooks/useBreakpoint';
import {
  formatAttachmentSize,
  isComposerAudioFile,
  isComposerVideoFile,
} from '../utils/fileMeta';
import { fileTooLargeMessage, isFileTooLarge } from '../utils/uploadErrors';
import AlertModal from './AlertModal';
import LiveUserName from './LiveUserName';
import { useVoiceRecorder, VOICE_MIN_MS } from '../hooks/useVoiceRecorder';
import {
  fetchLinkPreviewWithFallback,
  resolveLinkPreviewForSend,
} from '../hooks/fetchLinkPreview';
import { linkPreviewQueryKey, useLinkPreview } from '../hooks/useLinkPreview';
import LinkPreviewBlock from './LinkPreviewBlock';
import type { LinkDisplayMode } from '../types';
import {
  extractFirstHttpUrl,
  instantPreviewFromUrl,
  withLinkDisplay,
} from '../utils/linkPreviewUtils';
import { roleAtLeast } from '../utils/groupRoles';

type ComposerAlert = {
  title: string;
  description: string;
};

function isAllowedFile(file: File): boolean {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  return env.allowedFileExtensions.includes(ext);
}

function attachmentIcon(file: File) {
  if (file.type.startsWith('image/')) return ImageIcon;
  if (isComposerVideoFile(file)) return Film;
  if (isComposerAudioFile(file)) return Music;
  return File;
}

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type MessageComposerProps = {
  variant?: 'main' | 'thread';
  threadRootId?: string;
};

const MessageComposer: React.FC<MessageComposerProps> = ({
  variant = 'main',
  threadRootId,
}) => {
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [alert, setAlert] = useState<ComposerAlert | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const isMobile = useIsMobile();

  const showAlert = useCallback((title: string, description: string) => {
    setAlert({ title, description });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const micPointerActiveRef = useRef(false);

  const voice = useVoiceRecorder();

  const { user } = useAuth();
  const { data: conversationsData } = useConversations();
  const activeChat = conversationsData?.data?.find((c) => c.id === activeId);
  const dmPeerId = activeChat?.type === 'DIRECT' ? activeChat.dmPeer?.id : undefined;
  const isE2eeDm = isDmE2eeChat(activeChat);
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => fetchGroup(activeId!),
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
    async (
      file: File,
      options?: { voiceNote?: boolean },
    ): Promise<{
      uploadResult: Awaited<ReturnType<typeof uploadFile>>;
      attachment: E2eeFileAttachmentKeys | null;
    }> => {
      if (isE2eeDm && user?.id) {
        const { encryptedBlob, attachment } = await encryptFileBlob(await file.arrayBuffer());
        const encFile = new window.File([encryptedBlob], file.name, {
          type: 'application/octet-stream',
        });
        const uploadResult = await uploadFile(encFile, activeId ?? undefined, {
          ...options,
          e2eeEncrypted: true,
          originalMime: file.type || undefined,
        });
        return { uploadResult, attachment };
      }
      const uploadResult = await uploadFile(file, activeId ?? undefined, options);
      return { uploadResult, attachment: null };
    },
    [activeId, isE2eeDm, uploadFile, user?.id],
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
  const mentionTokenMatch = useMemo(() => {
    if (editingMessage || activeChat?.type !== 'GROUP' || !groupDetails) return null;
    return text.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
  }, [text, editingMessage, activeChat?.type, groupDetails]);
  const mentionQuery = mentionTokenMatch?.[1]?.toLowerCase() ?? '';
  const canUseAllMention = roleAtLeast(groupDetails?.myRole ?? 'MEMBER', 'ADMIN');
  const mentionCandidates = useMemo(() => {
    if (activeChat?.type !== 'GROUP' || !groupDetails || !mentionTokenMatch) return [];
    const candidates: Array<{ key: string; handle: string; label: string; userId?: string }> = [];
    if (canUseAllMention && 'all'.includes(mentionQuery)) {
      candidates.push({ key: 'all', handle: 'all', label: 'Notify everyone in this group' });
    }
    for (const m of groupDetails.members) {
      if (m.userId === user?.id) continue;
      const baseHandle =
        m.username?.trim() ||
        m.displayName?.toLowerCase().replace(/\s+/g, '') ||
        m.email.split('@')[0] ||
        'user';
      const handle = baseHandle.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
      const label = m.displayName || m.username || m.email;
      const hay = `${handle} ${label.toLowerCase()} ${m.email.toLowerCase()}`;
      if (!mentionQuery || hay.includes(mentionQuery)) {
        candidates.push({ key: m.userId, handle, label, userId: m.userId });
      }
      if (candidates.length >= 8) break;
    }
    return candidates;
  }, [activeChat?.type, groupDetails, mentionTokenMatch, canUseAllMention, mentionQuery, user?.id]);
  const replyTarget = messages?.find(m => m.id === replyingTo);
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
    !isE2eeDm;
  const { data: linkPreviewData, isFetching: isLinkPreviewFetching } = useLinkPreview(
    urlInText,
    linkPreviewEnabled,
  );
  const [linkDisplayAs, setLinkDisplayAs] = React.useState<LinkDisplayMode>('inline');
  const [previewDismissed, setPreviewDismissed] = React.useState(false);

  useEffect(() => {
    if (!urlInText) {
      setPreviewDismissed(false);
      setLinkDisplayAs('inline');
    }
  }, [urlInText]);

  const composerPreviewRaw = previewDismissed
    ? null
    : (linkPreviewData?.preview ?? (urlInText ? instantPreviewFromUrl(urlInText) : null));
  const composerPreview = composerPreviewRaw
    ? withLinkDisplay(composerPreviewRaw, linkDisplayAs)
    : null;

  // Load edit text once when entering edit mode (do not depend on drafts - that resets every keystroke).
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text);
      setAttachments([]);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    if (!editingMessage) {
      if (isThread && threadDraftKey) {
        setText(threadDrafts[threadDraftKey] || '');
      } else {
        setText(activeId ? drafts[activeId] || '' : '');
      }
    }
  }, [activeId, drafts, threadDrafts, threadDraftKey, editingMessage, isThread]);

  useEffect(() => {
    if (voice.error && voice.state === 'error') {
      toast.error(voice.error);
    }
  }, [voice.error, voice.state]);

  const closeComposerMenus = useCallback(() => {
    setShowPlusMenu(false);
    setShowGifPicker(false);
    setShowEmojiPicker(false);
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(target)) {
        setShowEmojiPicker(false);
      }
      if (
        (showPlusMenu || showGifPicker) &&
        plusMenuRef.current &&
        !plusMenuRef.current.contains(target)
      ) {
        setShowPlusMenu(false);
        setShowGifPicker(false);
      }
      if (mentionOpen && mentionMenuRef.current && !mentionMenuRef.current.contains(target)) {
        setMentionOpen(false);
      }
    };
    if (!showEmojiPicker && !showPlusMenu && !showGifPicker && !mentionOpen) return;
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showEmojiPicker, showPlusMenu, showGifPicker, mentionOpen]);

  useEffect(() => {
    setMentionOpen(mentionCandidates.length > 0);
    setMentionIndex(0);
  }, [mentionCandidates.length, mentionQuery]);

  const debouncedStopTyping = useCallback(
    debounce((chatId: string) => {
      socket.sendTyping(chatId, false);
    }, 2000),
    [socket]
  );

  const handleSend = async (opts?: { viaEnter?: boolean }) => {
    if (
      !activeId ||
      (isThread && !threadRootId) ||
      isSending ||
      isSavingEdit ||
      uploadStatus === 'uploading' ||
      voice.isRecording
    ) {
      return;
    }

    if (editingMessage) {
      const trimmed = text.trim();
      if (trimmed === editingMessage.text.trim()) {
        setEditingMessage(null);
        setText(activeId ? drafts[activeId] || '' : '');
        return;
      }
      editMessage(
        { chatId: activeId, messageId: editingMessage.id, text: trimmed, ...sendCtx },
        {
          onSuccess: () => {
            setEditingMessage(null);
            setText('');
            setDraft(activeId, '');
          },
          onError: () => {
            showAlert("Couldn't save your edit", 'Please try again.');
          },
        },
      );
      return;
    }

    if (!text.trim() && attachments.length === 0) {
      return;
    }

    const trimmedText = text.trim();
    const filesToSend = [...attachments];

    try {
      if (filesToSend.length > 0) {
        setUploadProgress({ current: 0, total: filesToSend.length });

        const uploadedEntries: Array<{
          uploadId: string;
          filename: string;
          originalName: string;
          mimetype: string;
          size: number;
          url: string;
          attachment?: E2eeFileAttachmentKeys;
        }> = [];

        for (let i = 0; i < filesToSend.length; i++) {
          const file = filesToSend[i];
          setUploadProgress({ current: i + 1, total: filesToSend.length });

          const { uploadResult, attachment } = await uploadForChat(file);
          if (!uploadResult.ok) {
            setUploadProgress(null);
            resetUpload();
            showAlert(
              'Upload failed',
              `"${file.name}": ${uploadResult.message}`,
            );
            return;
          }
          const uploaded = uploadResult.data;

          const mime = uploaded.mimetype || file.type;
          uploadedEntries.push({
            uploadId: uploaded.id,
            filename: uploaded.filename,
            originalName: uploaded.originalName,
            mimetype: mime,
            size: uploaded.size,
            url: uploaded.url,
            ...(attachment ? { attachment } : {}),
          });
        }

        const allImages = uploadedEntries.every((f) => f.mimetype.startsWith('image/'));
        await sendMessageAsync({
          chatId: activeId,
          text: trimmedText,
          replyToId: isThread ? undefined : replyingTo || undefined,
          kind: allImages ? 'IMAGE' : 'FILE',
          contentMeta: { files: uploadedEntries },
          ...sendCtx,
          ...threadSendMeta,
        });

        scrollToBottom();
      } else {
        let contentMeta: { preview: NonNullable<typeof composerPreview> } | undefined = composerPreview
          ? { preview: withLinkDisplay(composerPreview, linkDisplayAs) }
          : undefined;
        if (!contentMeta && !isE2eeDm) {
          const url = extractFirstHttpUrl(trimmedText);
          if (url) {
            const resolved = await resolveLinkPreviewForSend(url, queryClient);
            if (resolved) {
              contentMeta = { preview: withLinkDisplay(resolved, linkDisplayAs) };
            }
          }
        }

        let textMeta = contentMeta;
        if (activeChat?.type === 'GROUP' && groupDetails) {
          const parsed = parseMentionsFromText(trimmedText, groupDetails.members);
          if (parsed.all && !canUseAllMention) {
            showAlert(
              '@all is restricted',
              'Only Owner/Admin can use @all in this group.',
            );
            return;
          }
          if (parsed.all || parsed.userIds.length > 0) {
            textMeta = {
              ...(textMeta ?? {}),
              mentions: {
                userIds: parsed.userIds,
                ...(parsed.all ? { all: true } : {}),
              },
            };
          }
        }

        await sendMessageAsync({
          chatId: activeId,
          text: trimmedText,
          replyToId: isThread ? undefined : replyingTo || undefined,
          kind: 'TEXT',
          contentMeta: textMeta,
          ...sendCtx,
          ...threadSendMeta,
        });
        scrollToBottom();
      }
    } catch (err) {
      if (err instanceof E2eePeerNotReadyError || err instanceof E2eeKeysLockedError) {
        toast.error(err.message);
      } else if (err instanceof Error && /E2EE keys not initialized/i.test(err.message)) {
        toast.error('Encryption is not ready. Sign out and sign in again with your password.');
      } else {
        throw err;
      }
    } finally {
      setUploadProgress(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    setText('');
    setAttachments([]);
    if (isThread && threadDraftKey) {
      setThreadDraft(threadDraftKey, '');
    } else if (activeId) {
      setDraft(activeId, '');
    }
    if (isThread) {
      setThreadReplyingTo(null);
    } else {
      setReplyingTo(null);
    }
    setPreviewDismissed(false);
    setLinkDisplayAs('inline');
    resetUpload();
    setShowEmojiPicker(false);
    socket.sendTyping(activeId, false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    if (activeId && !editingMessage) {
      if (isThread && threadDraftKey) {
        setThreadDraft(threadDraftKey, val);
      } else {
        setDraft(activeId, val);
      }
      socket.sendTyping(activeId, true);
      debouncedStopTyping(activeId);
    }
  };

  const applyMention = (handle: string) => {
    const next = text.replace(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/, (m) =>
      m.replace(/@([a-zA-Z0-9_.-]*)$/, `@${handle} `),
    );
    setText(next);
    if (activeId && !editingMessage) {
      if (isThread && threadDraftKey) setThreadDraft(threadDraftKey, next);
      else setDraft(activeId, next);
    }
    setMentionOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (editingMessage || attachments.length > 0) return;
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const input = e.currentTarget;
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + pasted + text.slice(end);
    const urlInPasted = extractFirstHttpUrl(newText) ?? extractFirstHttpUrl(pasted);
    if (!urlInPasted) return;

    e.preventDefault();
    setText(newText);
    if (activeId) {
      setDraft(activeId, newText);
    }
    setPreviewDismissed(false);
    queryClient.setQueryData(linkPreviewQueryKey(urlInPasted), {
      preview: instantPreviewFromUrl(urlInPasted),
    });
    void queryClient.prefetchQuery({
      queryKey: linkPreviewQueryKey(urlInPasted),
      queryFn: () => fetchLinkPreviewWithFallback(urlInPasted),
      staleTime: 60_000,
    });
  };

  const handleEmojiClick = (emojiObject: { emoji: string }) => {
    if (inputRef.current) {
      const start = inputRef.current.selectionStart || 0;
      const end = inputRef.current.selectionEnd || 0;
      const newText = text.substring(0, start) + emojiObject.emoji + text.substring(end);
      setText(newText);
      if (activeId && !editingMessage) {
        setDraft(activeId, newText);
      }

      // Move cursor right after the emoji
      setTimeout(() => {
        inputRef.current!.selectionStart = inputRef.current!.selectionEnd = start + emojiObject.emoji.length;
        inputRef.current!.focus();
      }, 0);
    } else {
      const newText = text + emojiObject.emoji;
      setText(newText);
      if (activeId && !editingMessage) {
        setDraft(activeId, newText);
      }
    }
  };

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const picked = Array.from(incoming);
    if (picked.length === 0) return;

    const valid: File[] = [];
    const invalid: string[] = [];

    for (const file of picked) {
      if (isAllowedFile(file)) valid.push(file);
      else invalid.push(file.name);
    }

    if (invalid.length > 0) {
      showAlert(
        'Invalid file format',
        `${invalid.join(', ')} cannot be attached. Allowed: ${env.allowedFileExtensions.join(', ')}`,
      );
    }

    if (valid.length === 0) return;

    const allowed: File[] = [];
    const tooLarge: string[] = [];
    for (const file of valid) {
      if (isFileTooLarge(file)) tooLarge.push(file.name);
      else allowed.push(file);
    }

    if (tooLarge.length > 0) {
      showAlert(
        'File too large',
        tooLarge.length === 1
          ? fileTooLargeMessage(tooLarge[0]!)
          : `${tooLarge.join(', ')} exceed the ${env.maxUploadMb} MB upload limit.`,
      );
    }

    if (allowed.length === 0) return;

    setAttachments((prev) => {
      const slotsLeft = env.maxAttachments - prev.length;
      if (slotsLeft <= 0) {
        showAlert(
          'Attachment limit',
          `You can attach up to ${env.maxAttachments} files at a time.`,
        );
        return prev;
      }

      const toAdd = allowed.slice(0, slotsLeft);
      if (toAdd.length < allowed.length) {
        showAlert(
          'Attachment limit',
          `Only ${env.maxAttachments} files allowed. Added ${toAdd.length} of ${allowed.length} selected.`,
        );
      }

      return [...prev, ...toAdd];
    });
  }, [showAlert]);

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

  const handlePollSubmit = async (data: { question: string; closesAt: string | null; options: string[] }) => {
    if (!activeId) return;
    try {
      await createPollAsync({
        chatId: activeId,
        question: data.question,
        closesAt: data.closesAt,
        options: data.options,
        userId: user?.id,
        chat: activeChat ?? null,
        peerUserId: dmPeerId,
      });
      setShowPollModal(false);
      setReplyingTo(null);
      scrollToBottom();
    } catch (err: unknown) {
      if (err instanceof E2eePeerNotReadyError || err instanceof E2eeKeysLockedError) {
        toast.error(err.message);
        return;
      }
      toast.error(getApiErrorMessage(err, "We couldn't create the poll. Please try again."));
    }
  };

  const handleGifSelect = async (gif: GifResult) => {
    if (!activeId || editingMessage || isUploading) return;

    setShowGifPicker(false);
    try {
      setUploadProgress({ current: 1, total: 1 });
      const file = await gifToFile(gif);
      const { uploadResult, attachment } = await uploadForChat(file);
      if (!uploadResult.ok) {
        showAlert('Upload failed', uploadResult.message);
        return;
      }
      const uploaded = uploadResult.data;

      await sendMessageAsync({
        chatId: activeId,
        text: '',
        replyToId: isThread ? undefined : replyingTo || undefined,
        kind: 'IMAGE',
        ...sendCtx,
        ...threadSendMeta,
        contentMeta: {
          files: [
            {
              uploadId: uploaded.id,
              filename: uploaded.filename,
              originalName: gif.title ? `${gif.title}.gif` : uploaded.originalName,
              mimetype: uploaded.mimetype || 'image/gif',
              size: uploaded.size,
              url: uploaded.url,
              width: gif.width,
              height: gif.height,
              ...(attachment ? { attachment } : {}),
            },
          ],
        },
      });
      scrollToBottom();
      setReplyingTo(null);
    } catch {
      showAlert("Couldn't send GIF", 'Something went wrong. Please try again.');
    } finally {
      setUploadProgress(null);
      resetUpload();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionCandidates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const picked = mentionCandidates[mentionIndex];
        if (picked) applyMention(picked.handle);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend({ viaEnter: true });
    }
  };

  const sendVoiceNote = useCallback(
    async (result: { blob: Blob; mimeType: string; durationMs: number }) => {
      if (!activeId) return;
      if (result.durationMs < VOICE_MIN_MS) {
        toast.error('Hold the button longer to record a voice message');
        return;
      }

      const file = voice.toVoiceFile(result);
      try {
        setUploadProgress({ current: 1, total: 1 });
        const { uploadResult, attachment } = await uploadForChat(file, { voiceNote: true });
        if (!uploadResult.ok) {
          toast.error(uploadResult.message);
          return;
        }
        const uploaded = uploadResult.data;
        const voiceFile = {
          uploadId: uploaded.id,
          filename: uploaded.filename,
          originalName: 'Voice message',
          mimetype: result.mimeType || 'audio/webm',
          size: uploaded.size,
          url: uploaded.url,
          ...(attachment ? { attachment } : {}),
        };

        await sendMessageAsync({
          chatId: activeId,
          text: '',
          replyToId: isThread ? undefined : replyingTo || undefined,
          kind: 'FILE',
          ...sendCtx,
          ...threadSendMeta,
          contentMeta: {
            voiceNote: true,
            durationMs: result.durationMs,
            files: [voiceFile],
            ...voiceFile,
          },
        });

        scrollToBottom();
        setReplyingTo(null);
        setShowEmojiPicker(false);
        setShowPlusMenu(false);
        socket.sendTyping(activeId, false);
      } catch {
        toast.error("We couldn't send your voice message. Please try again.");
      } finally {
        setUploadProgress(null);
        resetUpload();
      }
    },
    [
      activeId,
      replyingTo,
      scrollToBottom,
      sendMessageAsync,
      socket,
      uploadForChat,
      resetUpload,
      voice,
      sendCtx,
    ],
  );

  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!activeId || editingMessage || uploadStatus === 'uploading' || isSending || isSavingEdit) {
        return;
      }
      e.preventDefault();
      micPointerActiveRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      void voice.start();
    },
    [activeId, editingMessage, uploadStatus, isSending, isSavingEdit, voice],
  );

  const handleMicPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!micPointerActiveRef.current) return;
      micPointerActiveRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!voice.isRecording) return;

      void voice.stop().then((result) => {
        if (result) {
          void sendVoiceNote(result);
        }
      });
    },
    [sendVoiceNote, voice],
  );

  const handleMicPointerLeave = useCallback(() => {
    if (!micPointerActiveRef.current || !voice.isRecording) return;
    micPointerActiveRef.current = false;
    voice.cancel();
    toast.message('Recording cancelled');
  }, [voice]);

  const isUploading = uploadStatus === 'uploading';
  const voiceBusy = isUploading || voice.isRecording;

  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 50 ? inset : 0);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <div
      className={`${styles.container} ${isThread ? styles.containerThread : ''}`}
      style={keyboardInset > 0 ? { paddingBottom: `calc(1rem + ${keyboardInset}px)` } : undefined}
    >
      <CreatePollModal
        open={showPollModal}
        onClose={() => setShowPollModal(false)}
        isSubmitting={isCreatingPoll}
        onSubmit={handlePollSubmit}
      />
      <AlertModal
        open={alert !== null}
        title={alert?.title ?? ''}
        description={alert?.description ?? ''}
        onClose={() => setAlert(null)}
      />
      {isMobile &&
        (showPlusMenu || showGifPicker || showEmojiPicker) &&
        createPortal(
          <button
            type="button"
            className={styles.composerMenuBackdrop}
            aria-label="Close menu"
            onClick={closeComposerMenus}
          />,
          document.body,
        )}
      {editingMessage && (
        <div className={styles.replyBar}>
          <div className={styles.replyInfo}>
            <Pencil size={14} className={styles.replyIcon} />
            <div className={styles.replyContent}>
              <span className={styles.replyLabel}>Editing message</span>
            </div>
          </div>
          <button className={styles.closeReply} onClick={() => setEditingMessage(null)} type="button">
            <X size={16} />
          </button>
        </div>
      )}
      {replyTarget && !editingMessage && !isThread && (
        <div className={styles.replyBar}>
          <div className={styles.replyInfo}>
            <Reply size={14} className={styles.replyIcon} />
            <div className={styles.replyContent}>
              <span className={styles.replyLabel}>
                Replying to{' '}
                <LiveUserName
                  userId={replyTarget.senderId}
                  displayName={replyTarget.sender?.displayName}
                  email={replyTarget.sender?.email}
                />
              </span>
              <p className={styles.replyText}>{replyPreviewText}</p>
            </div>
          </div>
          <button className={styles.closeReply} onClick={() => setReplyingTo(null)} type="button">
            <X size={16} />
          </button>
        </div>
      )}
      {threadReplyTarget && !editingMessage && isThread && (
        <div className={styles.replyBar}>
          <div className={styles.replyInfo}>
            <Reply size={14} className={styles.replyIcon} />
            <div className={styles.replyContent}>
              <span className={styles.replyLabel}>
                Replying to{' '}
                <LiveUserName
                  userId={threadReplyTarget.senderId}
                  displayName={threadReplyTarget.sender?.displayName}
                  email={threadReplyTarget.sender?.email}
                />
              </span>
              <p className={styles.replyText}>{threadReplyPreviewText}</p>
            </div>
          </div>
          <button
            className={styles.closeReply}
            onClick={() => setThreadReplyingTo(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {voice.isRecording && (
        <div className={styles.recordingBar} role="status" aria-live="polite">
          <span className={styles.recordingPulse} aria-hidden />
          <Mic size={18} className={styles.recordingMicIcon} aria-hidden />
          <div className={styles.recordingText}>
            <span className={styles.recordingTitle}>Recording…</span>
            <span className={styles.recordingHint}>Release to send</span>
          </div>
          <span className={styles.recordingTimer}>{formatRecordingTime(voice.elapsedMs)}</span>
          <button
            type="button"
            className={styles.recordingCancel}
            onClick={() => {
              micPointerActiveRef.current = false;
              voice.cancel();
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {composerPreview && !editingMessage && attachments.length === 0 && (
        <div className={styles.composerPreview}>
          <LinkPreviewBlock
            preview={composerPreview}
            displayAs={linkDisplayAs}
            variant="composer"
            isEnriching={isLinkPreviewFetching}
            onDisplayAsChange={setLinkDisplayAs}
            onRemove={() => setPreviewDismissed(true)}
          />
        </div>
      )}

      {attachments.length > 0 && (
        <div className={styles.attachmentList}>
          <div className={styles.attachmentListHeader}>
            <span>
              {attachments.length} file{attachments.length !== 1 ? 's' : ''} selected
              {attachments.length >= env.maxAttachments ? ` (max ${env.maxAttachments})` : ''}
              {' · '}
              max {env.maxUploadMb} MB each
            </span>
            {!isUploading && (
              <button
                type="button"
                className={styles.clearAttachments}
                onClick={() => setAttachments([])}
              >
                Clear all
              </button>
            )}
          </div>
          {attachments.map((file, index) => {
            const Icon = attachmentIcon(file);
            return (
            <div key={`${file.name}-${file.size}-${index}`} className={styles.attachmentBar}>
              <div className={styles.attachmentInfo}>
                <Icon size={18} />
                <div className={styles.attachmentMeta}>
                  <span className={styles.fileName} title={file.name}>
                    {truncateFilenameMiddle(file.name, 52)}
                  </span>
                  <span className={styles.fileSize}>{formatAttachmentSize(file.size)}</span>
                </div>
              </div>
              {isUploading && uploadProgress?.current === index + 1 && (
                <div className={styles.progressWrapper}>
                  <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                </div>
              )}
              <button
                type="button"
                className={styles.removeAttachment}
                onClick={() => removeAttachmentAt(index)}
                disabled={isUploading}
                aria-label={`Remove ${file.name}`}
              >
                <X size={16} />
              </button>
            </div>
            );
          })}
          {isUploading && uploadProgress && (
            <p className={styles.uploadStatus}>
              Uploading file {uploadProgress.current} of {uploadProgress.total}…
            </p>
          )}
        </div>
      )}

      {isThread && (
        <label className={styles.alsoSendRow}>
          <input
            type="checkbox"
            checked={alsoSendToMain}
            onChange={(e) => setAlsoSendToMain(e.target.checked)}
          />
          <span>Also send to direct message</span>
        </label>
      )}

      <div className={styles.wrapper}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={allowedFileAcceptAttribute()}
          multiple
          style={{ display: 'none' }}
        />

        <div className={styles.plusMenuWrap} ref={plusMenuRef}>
          <button
            type="button"
            className={`${styles.actionBtn} ${showPlusMenu || showGifPicker ? styles.actionBtnActive : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setShowEmojiPicker(false);
              setShowPlusMenu((open) => !open);
              if (showPlusMenu) setShowGifPicker(false);
            }}
            disabled={Boolean(editingMessage)}
            title="Add"
            aria-expanded={showPlusMenu || showGifPicker}
            aria-haspopup="menu"
          >
            <Plus size={20} />
          </button>

          {showPlusMenu && !showGifPicker && (
            <div className={styles.plusMenu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.plusMenuItem}
                disabled={attachments.length >= env.maxAttachments}
                onClick={openFilePicker}
              >
                <Paperclip size={18} />
                <span>Photos, videos &amp; files</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.plusMenuItem}
                onClick={openGifPicker}
              >
                <Film size={18} />
                <span>GIF</span>
              </button>
              {!isThread && (
                <button type="button" role="menuitem" className={styles.plusMenuItem} onClick={openPollModal}>
                  <BarChart2 size={18} />
                  <span>Poll</span>
                </button>
              )}
            </div>
          )}

          {showGifPicker && (
            <GifPickerPanel
              onClose={() => setShowGifPicker(false)}
              onSelect={(gif) => void handleGifSelect(gif)}
              disabled={isUploading}
            />
          )}
        </div>
        
        <input
          type="text"
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={
            editingMessage
              ? 'Edit message…'
              : voiceBusy
                ? voice.isRecording
                  ? 'Recording…'
                  : 'Uploading…'
                : isThread
                  ? 'Reply...'
                  : 'Type a message...'
          }
          className={styles.input}
          disabled={voiceBusy}
        />
        {mentionOpen && mentionCandidates.length > 0 && (
          <div className={styles.mentionMenu} ref={mentionMenuRef}>
            {mentionCandidates.map((c, idx) => (
              <button
                key={c.key}
                type="button"
                className={`${styles.mentionItem} ${idx === mentionIndex ? styles.mentionItemActive : ''}`}
                onMouseEnter={() => setMentionIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(c.handle);
                }}
              >
                <span className={styles.mentionHandle}>@{c.handle}</span>
                <span className={styles.mentionLabel}>{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {!editingMessage && (
          <button
            ref={micBtnRef}
            type="button"
            className={`${styles.actionBtn} ${styles.micBtn} ${
              voice.isRecording ? styles.micBtnRecording : ''
            }`}
            disabled={!activeId || voiceBusy && !voice.isRecording}
            title="Hold to record voice message"
            aria-label="Hold to record voice message"
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerCancel={handleMicPointerLeave}
            onPointerLeave={handleMicPointerLeave}
          >
            <Mic size={20} />
          </button>
        )}
        
        <div className={styles.emojiContainer} ref={emojiPickerRef}>
          <button
            type="button"
            className={styles.actionBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setShowPlusMenu(false);
              setShowGifPicker(false);
              setShowEmojiPicker((open) => !open);
            }}
            disabled={voiceBusy}
          >
            <Smile size={20} />
          </button>
          
          {showEmojiPicker && (
            <div className={styles.emojiPickerWrapper}>
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
        </div>
        
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={
            (editingMessage ? false : !text.trim() && attachments.length === 0) ||
            isSending ||
            isSavingEdit ||
            voiceBusy
          }
          className={`${styles.sendBtn} ${
            (editingMessage || text.trim() || attachments.length > 0) &&
            !isSending &&
            !isSavingEdit &&
            !voiceBusy
              ? styles.active
              : ''
          }`}
        >
          {isSending || isSavingEdit || voiceBusy ? (
            <Loader2 className={styles.spinner} size={18} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

    </div>
  );
};

export default MessageComposer;

