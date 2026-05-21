import { AppError } from "../errors/index.js";
import { getPrisma } from "./prisma.js";

export async function assertNotBlockedPair(a: string, b: string): Promise<void> {
  const prisma = getPrisma();
  const row = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  if (row) {
    throw new AppError(403, "BLOCKED", "Interaction is blocked");
  }
}

