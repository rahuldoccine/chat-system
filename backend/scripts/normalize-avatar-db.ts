/**
 * One-off: convert User.avatarUrl and Chat.avatarUrl from full URLs to file names only.
 * Run: npx tsx scripts/normalize-avatar-db.ts
 */
import "dotenv/config";

import { getPrisma, initPrisma } from "../src/lib/prisma.js";
import { loadConfig } from "../src/config/index.js";
import { normalizeAvatarDbValue } from "../src/lib/avatar-urls.js";

const config = loadConfig();
initPrisma(config);
const prisma = getPrisma();

async function main(): Promise<void> {
  let users = 0;
  let chats = 0;

  const userRows = await prisma.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, avatarUrl: true },
  });
  for (const row of userRows) {
    const next = normalizeAvatarDbValue(row.avatarUrl);
    if (next !== row.avatarUrl) {
      await prisma.user.update({ where: { id: row.id }, data: { avatarUrl: next } });
      users += 1;
    }
  }

  const chatRows = await prisma.chat.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, avatarUrl: true },
  });
  for (const row of chatRows) {
    const next = normalizeAvatarDbValue(row.avatarUrl);
    if (next !== row.avatarUrl) {
      await prisma.chat.update({ where: { id: row.id }, data: { avatarUrl: next } });
      chats += 1;
    }
  }

  console.log(`Normalized ${users} user avatar(s) and ${chats} group avatar(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
