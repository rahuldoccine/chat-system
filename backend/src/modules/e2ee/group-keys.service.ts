import { AppError } from "../../errors/index.js";
import { requireActiveMember } from "../../lib/chat-access.js";
import { getPrisma } from "../../lib/prisma.js";

export async function upsertGroupSenderKey(
  userId: string,
  chatId: string,
  input: { epoch: number; distribution: string },
): Promise<{ chatId: string; senderId: string; epoch: number }> {
  const me = await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2eeMode: true } });
  if (!chat || chat.type !== "GROUP" || chat.e2eeMode !== "GROUP_V1") {
    throw new AppError(400, "INVALID_CHAT", "Group sender keys require GROUP_V1");
  }
  if (!input.distribution || input.distribution.length < 8) {
    throw new AppError(400, "INVALID", "distribution required");
  }
  await prisma.groupSenderKey.upsert({
    where: {
      chatId_senderId_epoch: { chatId, senderId: me.userId, epoch: input.epoch },
    },
    create: {
      chatId,
      senderId: me.userId,
      epoch: input.epoch,
      distribution: input.distribution,
    },
    update: { distribution: input.distribution },
  });
  return { chatId, senderId: me.userId, epoch: input.epoch };
}

export async function listGroupSenderKeys(
  userId: string,
  chatId: string,
): Promise<
  Array<{ senderId: string; epoch: number; distribution: string; updatedAt: string }>
> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const rows = await prisma.groupSenderKey.findMany({
    where: { chatId },
    orderBy: [{ senderId: "asc" }, { epoch: "desc" }],
  });
  const latest = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    const k = `${r.senderId}:${r.epoch}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  return [...latest.values()].map((r) => ({
    senderId: r.senderId,
    epoch: r.epoch,
    distribution: r.distribution,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
