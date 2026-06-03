import { useEffect, useMemo, useState } from 'react';
import type { Chat } from '../types';
import { getServerAccountKeyStatus } from '../../e2ee/recovery';

export function getDashboardGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function filterMemberChats(conversations: Chat[]): Chat[] {
  return conversations.filter(
    (c) => c.type === 'DIRECT' || (c.type === 'GROUP' && c.isMember !== false),
  );
}

export type HomeDashboardMetrics = {
  greeting: string;
  needsKeyBackup: boolean;
  memberChats: Chat[];
  channels: Chat[];
  dms: Chat[];
  totalUnread: number;
  mentionUnread: number;
  onlineDmCount: number;
  recentChats: Chat[];
};

export function useHomeDashboardMetrics(
  conversations: Chat[],
  onlineUserIds: Set<string>,
): HomeDashboardMetrics {
  const [needsKeyBackup, setNeedsKeyBackup] = useState(false);

  useEffect(() => {
    void getServerAccountKeyStatus()
      .then((status) => setNeedsKeyBackup(status.hasIdentityKey && !status.hasBackup))
      .catch(() => setNeedsKeyBackup(false));
  }, []);

  const greeting = useMemo(() => getDashboardGreeting(), []);

  const memberChats = useMemo(() => filterMemberChats(conversations), [conversations]);

  const channels = useMemo(
    () => memberChats.filter((c) => c.type === 'GROUP'),
    [memberChats],
  );

  const dms = useMemo(
    () => memberChats.filter((c) => c.type === 'DIRECT'),
    [memberChats],
  );

  const totalUnread = useMemo(
    () => memberChats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [memberChats],
  );

  const mentionUnread = useMemo(
    () => memberChats.reduce((sum, c) => sum + (c.unreadMentionCount ?? 0), 0),
    [memberChats],
  );

  const onlineDmCount = useMemo(
    () => dms.filter((c) => c.dmPeer?.id != null && onlineUserIds.has(c.dmPeer.id)).length,
    [dms, onlineUserIds],
  );

  const recentChats = useMemo(
    () =>
      [...memberChats]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [memberChats],
  );

  return {
    greeting,
    needsKeyBackup,
    memberChats,
    channels,
    dms,
    totalUnread,
    mentionUnread,
    onlineDmCount,
    recentChats,
  };
}
