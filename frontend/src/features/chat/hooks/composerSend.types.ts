import type { QueryClient } from '@tanstack/react-query';
import type { Chat, LinkDisplayMode, LinkPreviewMeta } from '../types';
import type { GroupMember } from '../api/groupsApi';
import type { UploadFileResponse } from './useUpload';

export type UploadedEntry = {
  uploadId: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
};

export type ComposerSendContext = {
  chatId: string;
  isThread: boolean;
  threadSendMeta: { threadRootId?: string; broadcastToChannel?: boolean };
  sendCtx: {
    chat: Chat | null;
    peerUserId?: string;
    groupMemberIds?: string[];
  };
  editingMessage: { id: string; text: string } | null;
  text: string;
  attachments: File[];
  replyingTo: string | null;
  composerPreview: LinkPreviewMeta | null;
  linkDisplayAs: LinkDisplayMode;
  activeChat?: Chat;
  groupMembers?: GroupMember[];
  canUseAllMention: boolean;
};

export type ComposerSendDeps = {
  sendMessageAsync: (args: Record<string, unknown>) => Promise<unknown>;
  editMessage: (
    args: Record<string, unknown>,
    opts: { onSuccess?: () => void; onError?: () => void },
  ) => void;
  uploadForChat: (
    file: File,
    options?: { voiceNote?: boolean },
  ) => Promise<{ uploadResult: UploadFileResponse }>;
  queryClient: QueryClient;
  scrollToBottom: () => void;
  showAlert: (title: string, description: string) => void;
  setUploadProgress: (progress: { current: number; total: number } | null) => void;
  resetUpload: () => void;
  onEditCancelled: () => void;
  onEditSuccess: () => void;
  onSendSuccess: () => void;
};
