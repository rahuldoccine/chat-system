import { AppError } from "../../errors/index.js";
import { requireActiveMember } from "../../lib/chat-access.js";
import { getPrisma } from "../../lib/prisma.js";

function isE2eePollMessage(contentMeta: unknown): boolean {
  if (!contentMeta || typeof contentMeta !== "object") return false;
  const v = (contentMeta as Record<string, unknown>).e2eeVersion;
  return typeof v === "string" && v.length > 0;
}

export async function getPollForUser(userId: string, pollId: string) {
  const prisma = getPrisma();
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      message: { select: { contentMeta: true } },
    },
  });
  if (!poll) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  await requireActiveMember(userId, poll.chatId);
  const counts = await prisma.pollVote.groupBy({
    by: ["pollOptionId"],
    where: { pollId },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.pollOptionId, c._count._all]));
  const mine = await prisma.pollVote.findUnique({
    where: { pollId_userId: { pollId, userId } },
    select: { pollOptionId: true },
  });
  const allVotes = await prisma.pollVote.findMany({
    where: { pollId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
    },
  });
  const votersByOption = new Map<string, Array<{ id: string; displayName: string | null; email: string; avatarUrl: string | null }>>();
  for (const vote of allVotes) {
    const list = votersByOption.get(vote.pollOptionId) ?? [];
    list.push({
      id: vote.user.id,
      displayName: vote.user.displayName,
      email: vote.user.email,
      avatarUrl: vote.user.avatarUrl,
    });
    votersByOption.set(vote.pollOptionId, list);
  }
  const totalVotes = allVotes.length;
  const isE2ee = isE2eePollMessage(poll.message?.contentMeta);
  return {
    id: poll.id,
    chatId: poll.chatId,
    isE2ee,
    question: isE2ee ? "" : poll.question,
    closesAt: poll.closesAt,
    createdAt: poll.createdAt,
    myVoteOptionId: mine?.pollOptionId ?? null,
    totalVotes,
    options: poll.options.map((o) => ({
      id: o.id,
      label: isE2ee ? "" : o.label,
      sortOrder: o.sortOrder,
      votes: countMap.get(o.id) ?? 0,
      voters: votersByOption.get(o.id) ?? [],
    })),
  };
}

export async function votePoll(userId: string, pollId: string, pollOptionId: string) {
  const prisma = getPrisma();
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { options: true },
  });
  if (!poll) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  await requireActiveMember(userId, poll.chatId);
  if (poll.closesAt && poll.closesAt < new Date()) {
    throw new AppError(403, "POLL_CLOSED", "Poll is closed");
  }
  const opt = poll.options.find((o) => o.id === pollOptionId);
  if (!opt) {
    throw new AppError(400, "INVALID_OPTION", "Option does not belong to this poll");
  }
  const vote = await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    create: { pollId, userId, pollOptionId },
    update: { pollOptionId },
  });
  return { pollId, selectedOptionId: vote.pollOptionId, updatedAt: new Date() };
}
