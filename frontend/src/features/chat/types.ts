export type GroupVisibility = 'PRIVATE' | 'PUBLIC';

export type Chat = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  e2eeMode?: 'NONE' | 'DM_V1' | 'GROUP_V1';
  groupVisibility?: GroupVisibility;
  isMember?: boolean;
  canJoin?: boolean;
  title?: string;
  avatarUrl?: string | null;
  dmPeer?: {
    id: string;
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    lastSeenAt?: string;
    isOnline?: boolean;
  };
  lastMessage?: {
    ciphertext: string;
    createdAt: string;
  };
  unreadCount: number;
  updatedAt: string;
  mutedUntil?: string | null;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  byMe: boolean;
};

export type ReplyPreview = {
  id: string;
  senderId: string;
  ciphertext: string | null;
  kind?: 'TEXT' | 'IMAGE' | 'FILE' | 'POLL' | 'SYSTEM' | 'OTHER';
  contentMeta?: Message['contentMeta'];
  sender?: {
    id: string;
    displayName?: string;
    email?: string;
  };
};

export type Message = {
  id: string;
  /** Client-generated id for idempotent send and optimistic dedup. */
  clientMessageId?: string;
  chatId: string;
  senderId: string;
  sender: {
    id: string;
    name?: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  };
  ciphertext: string | null;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  threadReplyCount?: number;
  threadLastReplyAt?: string | null;
  reactionsSummary?: MessageReaction[];
  /** Server receipt state for outgoing messages in DMs. */
  receiptStatus?: 'sent' | 'delivered' | 'read';
  status?: 'sending' | 'sent' | 'error'; // Local UI state
  kind?: 'TEXT' | 'IMAGE' | 'FILE' | 'POLL' | 'SYSTEM' | 'OTHER';
  contentMeta?: {
    call?: {
      callId: string;
      kind: 'AUDIO' | 'VIDEO';
      status: 'completed' | 'missed' | 'rejected' | 'cancelled';
      durationSec?: number;
      initiatorId: string;
      peerId: string;
    };
    pollId?: string;
    /** Hold-to-record voice note (message kind stays FILE). */
    voiceNote?: boolean;
    /** Recorded length in milliseconds (client-measured). */
    durationMs?: number;
    url?: string;
    filename?: string;
    originalName?: string;
    mimetype?: string;
    size?: number;
    uploadId?: string;
    /** Multiple files in one message (batch upload). */
    files?: Array<{
      url?: string;
      filename?: string;
      originalName?: string;
      mimetype?: string;
      size?: number;
      uploadId?: string;
      width?: number;
      height?: number;
    }>;
    width?: number;
    height?: number;
    preview?: LinkPreviewMeta;
    e2eeVersion?: string;
    mentions?: { userIds?: string[]; all?: boolean };
    groupActivity?: Record<string, unknown>;
    senderFingerprint?: string;
    peerDeviceId?: string;
    senderDeviceId?: string;
  };
};

export type LinkDisplayMode = 'inline' | 'preview' | 'url';

export type LinkPreviewMeta = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  /** How the link is shown in the thread (default: inline). */
  displayAs?: LinkDisplayMode;
};

export const CHAT_MODULE_TYPE = true;

export type PollVoter = {
  id: string;
  displayName?: string | null;
  email?: string;
  avatarUrl?: string | null;
};

export type PollOption = {
  id: string;
  label: string;
  sortOrder: number;
  votes: number;
  voters?: PollVoter[];
};

export type PollDetail = {
  id: string;
  chatId: string;
  /** True when question/options are encrypted in the linked message. */
  isE2ee?: boolean;
  question: string;
  closesAt: string | null;
  createdAt: string;
  /** Option id the current user voted for, if any. */
  myVoteOptionId?: string | null;
  totalVotes?: number;
  options: PollOption[];
};
