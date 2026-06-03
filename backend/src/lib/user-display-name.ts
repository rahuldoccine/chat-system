import { getPrisma } from "./prisma.js";

export async function resolveUserDisplayName(userId: string): Promise<string> {
  const prisma = getPrisma();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true, username: true },
  });
  if (!u) return "Someone";
  return u.displayName?.trim() || u.username || u.email.split("@")[0] || u.email || "Someone";
}
