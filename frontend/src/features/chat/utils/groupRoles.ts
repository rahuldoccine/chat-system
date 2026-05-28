import type { GroupMemberRole } from '../api/groupsApi';

const rank: Record<GroupMemberRole, number> = {
  MEMBER: 1,
  MOD: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleAtLeast(role: GroupMemberRole, min: GroupMemberRole): boolean {
  return rank[role] >= rank[min];
}

export function canModerateMessages(role: GroupMemberRole): boolean {
  return roleAtLeast(role, 'MOD');
}

export function canManageGroupMeta(role: GroupMemberRole): boolean {
  return roleAtLeast(role, 'ADMIN');
}

export function canInviteGroupMembers(role: GroupMemberRole): boolean {
  return roleAtLeast(role, 'MOD');
}

export function roleLabel(role: GroupMemberRole): string {
  switch (role) {
    case 'OWNER':
      return 'Owner';
    case 'ADMIN':
      return 'Admin';
    case 'MOD':
      return 'Moderator';
    default:
      return 'Member';
  }
}
