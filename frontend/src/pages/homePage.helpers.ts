import type { Chat } from '../features/chat/types';
import { formatLastSeen } from '../utils/timeFormat';

export function getChatName(chat: Chat | undefined | null): string {
  if (!chat) return '';
  if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
  return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
}

type CallDisabledReasonInput = {
  activeId: string | null;
  isConnected: boolean;
  isMessagingRestricted: boolean;
  isStarting: boolean;
  phase: string;
  groupCallSessionId: string | null | undefined;
  canJoinExistingGroupCall: boolean;
};

export function getCallDisabledReason(input: CallDisabledReasonInput): string | undefined {
  const {
    activeId,
    isConnected,
    isMessagingRestricted,
    isStarting,
    phase,
    groupCallSessionId,
    canJoinExistingGroupCall,
  } = input;

  if (!activeId) return undefined;
  if (!isConnected) return 'Connecting…';
  if (isMessagingRestricted) return "You can't call while someone is blocked";
  if (isStarting) return 'Starting call…';
  if (phase !== 'idle') return 'Finish your current call first';
  if (groupCallSessionId && !canJoinExistingGroupCall) return 'Already in a group call';
  return undefined;
}

type BlockStatus = {
  blockedByMe?: boolean;
  blockedByPeer?: boolean;
} | null | undefined;

type ChatHeaderStatusInput = {
  blockStatus: BlockStatus;
  typingCount: number;
  isPeerOnline: boolean;
  activeChat: Chat | undefined;
  memberCount: number | undefined;
};

export function getChatHeaderStatusClassName(
  input: ChatHeaderStatusInput,
  styles: Record<'statusBlocked' | 'statusOnline' | 'statusMuted', string>,
): string {
  const { blockStatus, typingCount, isPeerOnline } = input;
  if (blockStatus?.blockedByPeer) return styles.statusBlocked;
  if (typingCount > 0 || isPeerOnline) return styles.statusOnline;
  return styles.statusMuted;
}

export function getChatHeaderStatusText(input: ChatHeaderStatusInput): string {
  const { blockStatus, typingCount, isPeerOnline, activeChat, memberCount } = input;

  if (blockStatus?.blockedByPeer) return 'You have been blocked by this user';
  if (blockStatus?.blockedByMe) return 'You blocked this user';
  if (typingCount > 0) {
    if (activeChat?.type === 'GROUP') return `${typingCount} typing...`;
    return 'Typing...';
  }
  if (activeChat?.type === 'GROUP') return `${memberCount ?? '…'} members`;
  if (isPeerOnline) return 'Online';
  if (activeChat?.dmPeer?.lastSeenAt) {
    return `Last seen ${formatLastSeen(activeChat.dmPeer.lastSeenAt)}`;
  }
  return 'Offline';
}

export type ChatSection =
  | 'messages'
  | 'files'
  | 'pins'
  | 'calls'
  | 'members'
  | 'settings';

const SECTION_BACK_LABELS: Record<ChatSection, string> = {
  messages: 'Messages',
  files: 'Files & Media',
  pins: 'Pins',
  calls: 'Call History',
  members: 'Members',
  settings: 'Settings',
};

export function getSectionBackLabel(section: string): string {
  if (section in SECTION_BACK_LABELS) {
    return SECTION_BACK_LABELS[section as ChatSection];
  }
  return 'Messages';
}

