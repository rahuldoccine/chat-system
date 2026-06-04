import { toast } from 'sonner';
import type { QueryClient } from '@tanstack/react-query';
import { sendComposerMessage } from '../hooks/composerSend.helpers';
import { canSendComposerMessage } from './messageComposer.helpers';
import { gifToFile, type GifResult } from '../utils/gifPicker';
import { E2eePeerNotReadyError } from '../../e2ee/directChat';
import { E2eeKeysLockedError } from '../../e2ee/bootstrap';
import { GroupKeyDistributionError } from '../../e2ee/groupSenderKeys';
import { getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import type { LinkDisplayMode, LinkPreviewMeta } from '../types';
import type { ComposerSendContext, ComposerSendDeps } from '../hooks/composerSend.types';

type SendActionParams = {
  activeId: string | null;
  isThread: boolean;
  threadRootId: string | undefined;
  isSending: boolean;
  isSavingEdit: boolean;
  uploadStatus: string;
  isRecording: boolean;
  threadSendMeta: ComposerSendContext['threadSendMeta'];
  sendCtx: ComposerSendContext['sendCtx'];
  editingMessage: ComposerSendContext['editingMessage'];
  text: string;
  attachments: File[];
  replyingTo: string | null;
  composerPreview: LinkPreviewMeta | null;
  linkDisplayAs: LinkDisplayMode;
  isE2eeDm: boolean;
  activeChat: ComposerSendContext['activeChat'];
  groupMembers: ComposerSendContext['groupMembers'];
  canUseAllMention: boolean;
  sendMessageAsync: ComposerSendDeps['sendMessageAsync'];
  editMessage: ComposerSendDeps['editMessage'];
  uploadForChat: ComposerSendDeps['uploadForChat'];
  queryClient: QueryClient;
  scrollToBottom: () => void;
  showAlert: (title: string, description: string) => void;
  setUploadProgress: (v: { current: number; total: number } | null) => void;
  resetUpload: () => void;
  setEditingMessage: (msg: { id: string; text: string } | null) => void;
  setText: (t: string) => void;
  setDraft: (id: string, text: string) => void;
  setAttachments: (value: File[]) => void;
  threadDraftKey: string | null;
  setThreadDraft: (key: string, text: string) => void;
  drafts: Record<string, string>;
  setReplyingTo: (id: string | null) => void;
  setThreadReplyingTo: (id: string | null) => void;
  setPreviewDismissed: (v: boolean) => void;
  setLinkDisplayAs: (mode: LinkDisplayMode) => void;
  setShowEmojiPicker: (v: boolean) => void;
  socket: { sendTyping: (chatId: string, typing: boolean) => void };
  focusInput: () => void;
};

export async function runComposerSendAction(p: SendActionParams): Promise<void> {
  if (
    !canSendComposerMessage({
      activeId: p.activeId,
      isThread: p.isThread,
      threadRootId: p.threadRootId,
      isSending: p.isSending,
      isSavingEdit: p.isSavingEdit,
      uploadStatus: p.uploadStatus,
      isRecording: p.isRecording,
    })
  ) {
    return;
  }
  if (!p.activeId) return;
  const chatId = p.activeId;

  try {
    await sendComposerMessage(
      {
        chatId,
        isThread: p.isThread,
        threadSendMeta: p.threadSendMeta,
        sendCtx: p.sendCtx,
        editingMessage: p.editingMessage,
        text: p.text,
        attachments: p.attachments,
        replyingTo: p.replyingTo,
        composerPreview: p.composerPreview,
        linkDisplayAs: p.linkDisplayAs,
        isE2eeDm: p.isE2eeDm,
        activeChat: p.activeChat,
        groupMembers: p.groupMembers,
        canUseAllMention: p.canUseAllMention,
      },
      {
        sendMessageAsync: p.sendMessageAsync,
        editMessage: p.editMessage,
        uploadForChat: p.uploadForChat,
        queryClient: p.queryClient,
        scrollToBottom: p.scrollToBottom,
        showAlert: p.showAlert,
        setUploadProgress: p.setUploadProgress,
        resetUpload: p.resetUpload,
        onEditCancelled: () => {
          p.setEditingMessage(null);
          p.setText(p.activeId ? p.drafts[p.activeId] || '' : '');
        },
        onEditSuccess: () => {
          p.setEditingMessage(null);
          p.setText('');
          p.setDraft(chatId, '');
        },
        onSendSuccess: () => {
          p.setText('');
          p.setAttachments([]);
          if (p.isThread && p.threadDraftKey) {
            p.setThreadDraft(p.threadDraftKey, '');
          } else {
            p.setDraft(chatId, '');
          }
          if (p.isThread) {
            p.setThreadReplyingTo(null);
          } else {
            p.setReplyingTo(null);
          }
          p.setPreviewDismissed(false);
          p.setLinkDisplayAs('inline');
          p.resetUpload();
          p.setShowEmojiPicker(false);
          p.socket.sendTyping(chatId, false);
        },
      },
    );
  } finally {
    requestAnimationFrame(p.focusInput);
  }
}

export type PollSubmitParams = {
  activeId: string | null;
  data: { question: string; closesAt: string | null; options: string[] };
  createPollAsync: (args: unknown) => Promise<unknown>;
  userId: string | undefined;
  activeChat: unknown;
  dmPeerId: string | undefined;
  setShowPollModal: (v: boolean) => void;
  setReplyingTo: (id: string | null) => void;
  scrollToBottom: () => void;
};

export async function runComposerPollSubmit(p: PollSubmitParams): Promise<void> {
  if (!p.activeId) return;
  try {
    await p.createPollAsync({
      chatId: p.activeId,
      question: p.data.question,
      closesAt: p.data.closesAt,
      options: p.data.options,
      userId: p.userId,
      chat: p.activeChat ?? null,
      peerUserId: p.dmPeerId,
    });
    p.setShowPollModal(false);
    p.setReplyingTo(null);
    p.scrollToBottom();
  } catch (err: unknown) {
    if (
      err instanceof E2eePeerNotReadyError ||
      err instanceof E2eeKeysLockedError ||
      err instanceof GroupKeyDistributionError
    ) {
      toast.error(err.message);
      return;
    }
    toast.error(getApiErrorMessage(err, "We couldn't create the poll. Please try again."));
  }
}

export async function runComposerGifSelect(
  gif: GifResult,
  p: {
    activeId: string | null;
    editingMessage: { id: string; text: string } | null;
    isUploading: boolean;
    isThread: boolean;
    replyingTo: string | null;
    sendCtx: Record<string, unknown>;
    threadSendMeta: Record<string, unknown>;
    setShowGifPicker: (v: boolean) => void;
    setUploadProgress: (v: { current: number; total: number } | null) => void;
    uploadForChat: SendActionParams['uploadForChat'];
    showAlert: (title: string, description: string) => void;
    sendMessageAsync: (args: unknown) => Promise<unknown>;
    scrollToBottom: () => void;
    setReplyingTo: (id: string | null) => void;
    resetUpload: () => void;
  },
): Promise<void> {
  if (!p.activeId || p.editingMessage || p.isUploading) return;

  p.setShowGifPicker(false);
  try {
    p.setUploadProgress({ current: 1, total: 1 });
    const file = await gifToFile(gif);
    const { uploadResult, attachment } = await p.uploadForChat(file);
    if (!uploadResult.ok) {
      p.showAlert('Upload failed', uploadResult.message ?? 'Upload failed');
      return;
    }
    const uploaded = uploadResult.data as {
      id: string;
      filename: string;
      originalName: string;
      mimetype: string;
      size: number;
      url: string;
    };

    await p.sendMessageAsync({
      chatId: p.activeId,
      text: '',
      replyToId: p.isThread ? undefined : p.replyingTo || undefined,
      kind: 'IMAGE',
      ...p.sendCtx,
      ...p.threadSendMeta,
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
    p.scrollToBottom();
    p.setReplyingTo(null);
  } catch {
    p.showAlert("Couldn't send GIF", 'Something went wrong. Please try again.');
  } finally {
    p.setUploadProgress(null);
    p.resetUpload();
  }
}
