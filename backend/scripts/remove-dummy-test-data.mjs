#!/usr/bin/env node
/**
 * DEV ONLY — removes all data created by seed-dummy-test-data.mjs
 *
 * Deletes:
 *   - Users with email *@seed-test.local
 *   - Chats listed in scripts/.seed-test-manifest.json
 *   - Group chats created by a seed user (createdById)
 *   - Direct chats where both participants are seed users
 *
 * Usage (from backend/):
 *   CONFIRM=YES npm run db:remove-seed
 *   npm run db:remove-seed -- --dry-run
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { cleanupOrphanDirectChatsForUser } from "./lib/cleanup-orphan-direct-chats.mjs";

const DEFAULT_JOIN_EMAIL = (
  process.env.SEED_JOIN_EMAIL ?? "rahul.doccine@gmail.com"
).trim().toLowerCase();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, ".seed-test-manifest.json");

const SEED_EMAIL_DOMAIN = "seed-test.local";

const dryRun = process.argv.includes("--dry-run");
const confirmed = process.env.CONFIRM === "YES";

if (!dryRun && !confirmed) {
  console.error(
    [
      "Refusing to run without confirmation.",
      "",
      "This deletes all @seed-test.local users and chats tracked by the seed manifest.",
      "",
      "Dry run:  npm run db:remove-seed -- --dry-run",
      "Execute:  CONFIRM=YES npm run db:remove-seed",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const seedUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
      select: { id: true, email: true },
    });
    const seedUserIds = new Set(seedUsers.map((u) => u.id));

    const seedCreatedGroups =
      seedUserIds.size > 0
        ? await prisma.chat.findMany({
            where: {
              type: "GROUP",
              createdById: { in: [...seedUserIds] },
            },
            select: { id: true, title: true },
          })
        : [];

    const directChats = await prisma.chat.findMany({
      where: { type: "DIRECT", dmKey: { not: null } },
      select: { id: true, dmKey: true },
    });
    const seedDms = directChats.filter((c) => {
      if (!c.dmKey) return false;
      const ids = c.dmKey.split(":");
      return ids.length === 2 && ids.every((id) => seedUserIds.has(id));
    });

    const chatIds = new Set([
      ...seedCreatedGroups.map((g) => g.id),
      ...seedDms.map((d) => d.id),
    ]);

    try {
      const raw = await readFile(MANIFEST_PATH, "utf8");
      const manifest = JSON.parse(raw);
      for (const id of manifest.chatIds ?? []) chatIds.add(id);
    } catch {
      /* no manifest */
    }

    console.log(dryRun ? "[dry-run] " : "", "Remove seed test data\n");
    console.log(`  Seed users: ${seedUsers.length}`);
    console.log(`  Groups created by seed users: ${seedCreatedGroups.length}`);
    console.log(`  Seed-only DMs: ${seedDms.length}`);
    console.log(`  Total chats to delete: ${chatIds.size}`);
    console.log("");

    if (seedUsers.length === 0 && chatIds.size === 0) {
      console.log("Nothing to remove.");
      return;
    }

    if (dryRun) {
      seedUsers.forEach((u) => console.log(`  would delete user: ${u.email}`));
      for (const id of chatIds) {
        const c = await prisma.chat.findUnique({
          where: { id },
          select: { title: true, type: true },
        });
        console.log(`  would delete chat: ${c?.title ?? c?.type ?? id}`);
      }
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (chatIds.size > 0) {
        await tx.chat.deleteMany({ where: { id: { in: [...chatIds] } } });
      }
      if (seedUserIds.size > 0) {
        await tx.user.deleteMany({
          where: { id: { in: [...seedUserIds] } },
        });
      }
    });

    const joinUser = await prisma.user.findUnique({
      where: { email: DEFAULT_JOIN_EMAIL },
      select: { id: true },
    });
    if (joinUser) {
      const removed = await cleanupOrphanDirectChatsForUser(prisma, joinUser.id);
      if (removed > 0) {
        console.log(`  cleaned ${removed} orphan DM(s) for ${DEFAULT_JOIN_EMAIL}`);
      }
    }

    console.log("Removed seed users and chats.");
    console.log(`(Optional) delete manifest: ${MANIFEST_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
