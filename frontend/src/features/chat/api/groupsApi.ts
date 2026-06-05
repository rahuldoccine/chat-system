import api from '../../../api/axios';
import type { GroupVisibility } from '../types';

export type GroupMemberRole = 'OWNER' | 'ADMIN' | 'MOD' | 'MEMBER';

export type GroupMember = {
  userId: string;
  role: GroupMemberRole;
  joinedAt: string;
  displayName: string | null;
  email: string;
  username: string | null;
  avatarUrl: string | null;
};

export type GroupDetails = {
  id: string;
  title: string | null;
  avatarUrl: string | null;
  groupVisibility: GroupVisibility;
  memberCount: number;
  myRole: GroupMemberRole;
  members: GroupMember[];
};

export async function fetchGroup(groupId: string): Promise<GroupDetails> {
  const res = await api.get(`/groups/${groupId}`);
  return res.data.group as GroupDetails;
}

export async function createGroup(input: {
  title: string;
  memberIds?: string[];
  groupVisibility?: GroupVisibility;
}): Promise<{ chat: { id: string }; created: boolean }> {
  const res = await api.post('/groups', {
    type: 'GROUP',
    title: input.title,
    memberIds: input.memberIds,
    ...(input.groupVisibility ? { groupVisibility: input.groupVisibility } : {}),
  });
  return res.data;
}

export async function patchGroup(
  groupId: string,
  data: { title?: string; avatarUrl?: string | null; groupVisibility?: GroupVisibility },
): Promise<void> {
  await api.patch(`/groups/${groupId}`, data);
}

export async function joinPublicGroup(groupId: string): Promise<void> {
  await api.post(`/groups/${groupId}/join`);
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await api.post(`/groups/${groupId}/members`, { userId });
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await api.delete(`/groups/${groupId}/members/${userId}`);
}

export async function patchGroupMemberRole(
  groupId: string,
  userId: string,
  role: 'ADMIN' | 'MOD' | 'MEMBER',
): Promise<void> {
  await api.patch(`/groups/${groupId}/members/${userId}/role`, { role });
}

export async function leaveGroup(groupId: string, myUserId: string): Promise<void> {
  await removeGroupMember(groupId, myUserId);
}
