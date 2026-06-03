import { useCallback, useMemo } from 'react';
import type { GroupMember } from '../api/groupsApi';

type ActiveChatForTyping = {
  type: string;
  title?: string;
  dmPeer?: {
    id: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  };
} | undefined;

export function useMessageStreamTyping(
  isPeerTyping: boolean,
  peerTypingCount: number,
  peerTypingIds: string[],
  activeChat: ActiveChatForTyping,
  groupMemberById: Map<string, GroupMember>,
) {
  const getChatName = useCallback(() => {
    if (!activeChat) return 'this chat';
    if (activeChat.type === 'GROUP') return activeChat.title || 'this group';
    return activeChat.dmPeer?.displayName || activeChat.dmPeer?.email || 'this person';
  }, [activeChat]);

  const typingLabel = useMemo(() => {
    if (!isPeerTyping) return '';
    if (activeChat?.type === 'DIRECT') {
      return `${getChatName()} is typing`;
    }
    if (peerTypingCount === 1) {
      const uid = peerTypingIds[0];
      const member = uid ? groupMemberById.get(uid) : undefined;
      const name =
        member?.displayName || member?.username || member?.email || 'Someone';
      return `${name} is typing`;
    }
    return `${peerTypingCount} people are typing`;
  }, [
    isPeerTyping,
    activeChat?.type,
    getChatName,
    peerTypingCount,
    peerTypingIds,
    groupMemberById,
  ]);

  const typingPeer = useMemo(() => {
    if (!isPeerTyping) return undefined;
    if (activeChat?.type === 'DIRECT') return activeChat.dmPeer;
    const uid = peerTypingIds[0];
    const member = uid ? groupMemberById.get(uid) : undefined;
    if (!member) return undefined;
    return {
      id: member.userId,
      displayName: member.displayName,
      email: member.email,
      avatarUrl: member.avatarUrl,
    };
  }, [isPeerTyping, activeChat, peerTypingIds, groupMemberById]);

  return { typingLabel, typingPeer, getChatName };
}
