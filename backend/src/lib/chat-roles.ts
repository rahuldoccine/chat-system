import type { ChatMemberRole } from "@prisma/client";

const rank: Record<ChatMemberRole, number> = {
  MEMBER: 1,
  MOD: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleAtLeast(role: ChatMemberRole, min: ChatMemberRole): boolean {
  return rank[role] >= rank[min];
}

export function canModerateMessages(role: ChatMemberRole): boolean {
  return roleAtLeast(role, "MOD");
}

export function canManageGroupMeta(role: ChatMemberRole): boolean {
  return roleAtLeast(role, "ADMIN");
}

/** Invite or add members (private groups: owner, admin, moderator). */
export function canInviteGroupMembers(role: ChatMemberRole): boolean {
  return roleAtLeast(role, "MOD");
}

export function roleRank(role: ChatMemberRole): number {
  return rank[role];
}
