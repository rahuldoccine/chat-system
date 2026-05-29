/**
 * Deletes DIRECT chats where `userId` has no other active member with a valid user row.
 * Common after seed users are removed/recreated while the join user still has stale DMs.
 */
export async function cleanupOrphanDirectChatsForUser(prisma, userId) {
  const memberships = await prisma.chatMember.findMany({
    where: { userId, leftAt: null, chat: { type: "DIRECT" } },
    include: {
      chat: {
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true } } },
          },
        },
      },
    },
  });

  const orphanChatIds = [];
  for (const m of memberships) {
    const others = m.chat.members.filter((x) => x.userId !== userId);
    const hasValidPeer = others.some((x) => x.user != null);
    if (!hasValidPeer) orphanChatIds.push(m.chat.id);
  }

  if (orphanChatIds.length === 0) return 0;

  await prisma.chat.deleteMany({ where: { id: { in: orphanChatIds } } });
  return orphanChatIds.length;
}
