/** Shared Prisma includes for message queries with sender + reply preview. */

export const senderSelect = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;

export const messageWithSenderInclude = {
  sender: { select: senderSelect },
  replyTo: {
    include: {
      sender: { select: senderSelect },
    },
  },
} as const;
