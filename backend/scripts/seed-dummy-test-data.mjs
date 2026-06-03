#!/usr/bin/env node
/**
 * DEV ONLY — creates dummy users and sample public/private groups for UI testing.
 * Safe to delete later with: npm run db:remove-seed
 *
 * All seed users use email *@seed-test.local and password from SEED_TEST_PASSWORD (default below).
 * Created chat IDs are stored in scripts/.seed-test-manifest.json for cleanup.
 *
 * Usage (from backend/):
 *   npm run db:seed-test
 *   npm run db:seed-test -- --users=15 --public=5 --private=5
 *   npm run db:seed-test -- --dry-run
 *
 * SEED_JOIN_EMAIL (default: rahul.doccine@gmail.com) is added to every seeded group.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import { cleanupOrphanDirectChatsForUser } from "./lib/cleanup-orphan-direct-chats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, ".seed-test-manifest.json");

const SEED_EMAIL_DOMAIN = "seed-test.local";
const DEFAULT_PASSWORD = process.env.SEED_TEST_PASSWORD ?? "SeedTest123!"; // NOSONAR
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
/** Always added as MEMBER to every seeded group. Override with SEED_JOIN_EMAIL. */
const DEFAULT_JOIN_EMAIL = (
  process.env.SEED_JOIN_EMAIL ?? "rahul.doccine@gmail.com"
).trim().toLowerCase();

const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Quinn",
  "Avery", "Blake", "Cameron", "Dakota", "Emery", "Finley", "Harper", "Jamie",
  "Kai", "Logan", "Noah", "Parker", "Reese", "Sage", "Skyler", "Rowan",
];

const LAST_NAMES = [
  "Chen", "Patel", "Kim", "Garcia", "Nguyen", "Singh", "Martin", "Lee",
  "Brown", "Wilson", "Clark", "Hall", "Young", "King", "Wright", "Lopez",
];

const PUBLIC_GROUP_NAMES = [
  "Announcements", "General Lounge", "Random", "Tech Talk", "Design Hub",
  "Weekend Plans", "Open Floor", "Community Help", "Show and Tell", "Off Topic",
];

const PRIVATE_GROUP_NAMES = [
  "Leadership", "Project Alpha", "HR Confidential", "Exec Sync", "Legal Review",
  "Finance Core", "Product Strategy", "Engineering Staff", "Client Work", "Internal Ops",
];

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  let users = 12;
  let publicGroups = 4;
  let privateGroups = 4;
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(users|public|private)=(\d+)$/);
    if (m) {
      if (m[1] === "users") users = Number(m[2]);
      if (m[1] === "public") publicGroups = Number(m[2]);
      if (m[1] === "private") privateGroups = Number(m[2]);
    }
  }
  return { dryRun, users, publicGroups, privateGroups };
}

/** Non-security random picks for dev-only fixture data (names, member counts, shuffle). */
function pick(arr) {
  return arr[randomInt(arr.length)];
}

function pickMany(arr, count) {
  const copy = [...arr];
  const out = [];
  while (out.length < count && copy.length > 0) {
    const i = randomInt(copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const { dryRun, users: userCount, publicGroups, privateGroups } = parseArgs();
  const prisma = new PrismaClient();

  console.log(dryRun ? "[dry-run] " : "", "Seed test data");
  console.log(`  Users: ${userCount} (*@${SEED_EMAIL_DOMAIN})`);
  console.log(`  Public groups: ${publicGroups}, Private groups: ${privateGroups}`);
  console.log(`  Password (all seed users): ${DEFAULT_PASSWORD}`);
  console.log(`  Auto-join all seeded groups: ${DEFAULT_JOIN_EMAIL}`);
  console.log("");

  const passwordHash = dryRun ? null : await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  const manifest = {
    seededAt: new Date().toISOString(),
    emailDomain: SEED_EMAIL_DOMAIN,
    defaultPassword: DEFAULT_PASSWORD,
    joinEmail: DEFAULT_JOIN_EMAIL,
    userIds: [],
    chatIds: [],
    users: [],
    groups: [],
  };

  try {
    try {
      const raw = await readFile(MANIFEST_PATH, "utf8");
      const prev = JSON.parse(raw);
      for (const id of prev.chatIds ?? []) {
        if (!manifest.chatIds.includes(id)) manifest.chatIds.push(id);
      }
    } catch {
      /* no previous manifest */
    }

    const existingSeedUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
      select: { id: true, email: true, displayName: true },
    });

    const seedUserIds = [...existingSeedUsers.map((u) => u.id)];

    for (let i = 1; i <= userCount; i++) {
      const email = `seed.user${i}@${SEED_EMAIL_DOMAIN}`;
      const username = `seed_user_${i}`;
      const displayName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

      const existing = existingSeedUsers.find((u) => u.email === email);
      if (existing) {
        console.log(`  skip user (exists): ${email}`);
        if (!seedUserIds.includes(existing.id)) seedUserIds.push(existing.id);
        manifest.users.push({ email, id: existing.id, displayName: existing.displayName });
        continue;
      }

      if (dryRun) {
        console.log(`  would create user: ${email} (${displayName})`);
        continue;
      }

      const user = await prisma.user.create({
        data: {
          email,
          username,
          passwordHash: passwordHash,
          displayName,
          emailVerifiedAt: new Date(),
          userSettings: { create: {} },
        },
        select: { id: true, email: true, displayName: true },
      });
      seedUserIds.push(user.id);
      manifest.userIds.push(user.id);
      manifest.users.push({ email: user.email, id: user.id, displayName: user.displayName });
      console.log(`  created user: ${email}`);
    }

    if (seedUserIds.length === 0 && !dryRun) {
      console.error("No seed users available. Create users first (remove --dry-run).");
      process.exit(1);
    }

    if (dryRun && seedUserIds.length === 0) {
      seedUserIds.push("00000000-0000-0000-0000-000000000001");
    }

    const defaultJoinUser = await prisma.user.findUnique({
      where: { email: DEFAULT_JOIN_EMAIL },
      select: { id: true, email: true, displayName: true, deletedAt: true },
    });
    if (!defaultJoinUser || defaultJoinUser.deletedAt) {
      console.warn(
        `  Warning: DEFAULT_JOIN_EMAIL not found (${DEFAULT_JOIN_EMAIL}) — groups will not include your account.`,
      );
    } else if (dryRun) {
      console.log(
        `  will add to every seeded group: ${defaultJoinUser.displayName ?? defaultJoinUser.email}`,
      );
    } else {
      console.log(
        `  joining all seeded groups: ${defaultJoinUser.displayName ?? defaultJoinUser.email}`,
      );
    }

    const defaultJoinUserId =
      defaultJoinUser && !defaultJoinUser.deletedAt ? defaultJoinUser.id : null;

    async function ensureDefaultMemberInGroup(chatId, fullTitle) {
      if (!defaultJoinUserId) return;
      const existing = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: defaultJoinUserId } },
        select: { leftAt: true },
      });
      if (existing?.leftAt === null) return;
      if (dryRun) {
        console.log(`  would add ${DEFAULT_JOIN_EMAIL} → ${fullTitle}`);
        return;
      }
      if (existing) {
        await prisma.chatMember.update({
          where: { chatId_userId: { chatId, userId: defaultJoinUserId } },
          data: { leftAt: null, role: "MEMBER" },
        });
        console.log(`  re-joined ${DEFAULT_JOIN_EMAIL} → ${fullTitle}`);
        return;
      }
      await prisma.chatMember.create({
        data: { chatId, userId: defaultJoinUserId, role: "MEMBER" },
      });
      console.log(`  joined ${DEFAULT_JOIN_EMAIL} → ${fullTitle}`);
    }

    const usedPublic = new Set();
    const usedPrivate = new Set();

    async function createGroup(visibility, namePool, usedSet) {
      let title = pick(namePool);
      let attempts = 0;
      while (usedSet.has(title) && attempts < 20) {
        title = pick(namePool);
        attempts++;
      }
      usedSet.add(title);
      const ownerId = pick(seedUserIds);
      const memberCount = 2 + randomInt(4);
      const members = pickMany(seedUserIds, Math.min(memberCount, seedUserIds.length));
      if (!members.includes(ownerId)) members.unshift(ownerId);
      if (defaultJoinUserId && !members.includes(defaultJoinUserId)) {
        members.push(defaultJoinUserId);
      }
      const memberSet = [...new Set(members)];

      const existing = await prisma.chat.findFirst({
        where: { type: "GROUP", title },
        select: { id: true, title: true },
      });
      if (existing) {
        console.log(`  skip group (exists): ${title}`);
        if (!manifest.chatIds.includes(existing.id)) manifest.chatIds.push(existing.id);
        manifest.groups.push({ id: existing.id, title, visibility });
        await ensureDefaultMemberInGroup(existing.id, title);
        return;
      }

      if (dryRun) {
        console.log(
          `  would create ${visibility} group: ${title} (${memberSet.length} members, incl. ${DEFAULT_JOIN_EMAIL})`,
        );
        return;
      }

      const chat = await prisma.$transaction(async (tx) => {
        const c = await tx.chat.create({
          data: {
            type: "GROUP",
            title,
            createdById: ownerId,
            e2eeMode: "NONE",
            groupVisibility: visibility,
            lastMessageAt: new Date(),
          },
        });
        await tx.chatMember.createMany({
          data: memberSet.map((userId) => ({
            chatId: c.id,
            userId,
            role: userId === ownerId ? "OWNER" : "MEMBER",
          })),
        });
        return c;
      });

      manifest.chatIds.push(chat.id);
      manifest.groups.push({
        id: chat.id,
        title,
        visibility,
        memberCount: memberSet.length,
      });
      console.log(`  created ${visibility} group: ${title} (${memberSet.length} members)`);
    }

    for (let i = 0; i < publicGroups; i++) {
      await createGroup("PUBLIC", PUBLIC_GROUP_NAMES, usedPublic);
    }
    for (let i = 0; i < privateGroups; i++) {
      await createGroup("PRIVATE", PRIVATE_GROUP_NAMES, usedPrivate);
    }

    if (defaultJoinUserId && manifest.chatIds.length > 0) {
      const uniqueChatIds = [...new Set(manifest.chatIds)];
      for (const chatId of uniqueChatIds) {
        const g = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { id: true, title: true, type: true },
        });
        if (!g || g.type !== "GROUP") continue;
        await ensureDefaultMemberInGroup(g.id, g.title ?? g.id);
      }
    }

    if (!dryRun) {
      const dmPairs = Math.min(3, Math.floor(seedUserIds.length / 2));
      const shuffled = shuffle(seedUserIds);
      for (let i = 0; i < dmPairs; i++) {
        const a = shuffled[i * 2];
        const b = shuffled[i * 2 + 1];
        if (!a || !b) break;
        const dmKey = [a, b].sort((x, y) => x.localeCompare(y)).join(":");
        const exists = await prisma.chat.findUnique({ where: { dmKey }, select: { id: true } });
        if (exists) continue;
        const dm = await prisma.chat.create({
          data: {
            type: "DIRECT",
            dmKey,
            createdById: a,
            e2eeMode: "DM_V1",
            members: {
              create: [
                { userId: a, role: "OWNER" },
                { userId: b, role: "MEMBER" },
              ],
            },
          },
        });
        manifest.chatIds.push(dm.id);
        console.log(`  created DM: ${a.slice(0, 8)}… ↔ ${b.slice(0, 8)}…`);
      }

      if (defaultJoinUserId) {
        const removed = await cleanupOrphanDirectChatsForUser(prisma, defaultJoinUserId);
        if (removed > 0) {
          console.log(`  cleaned ${removed} orphan DM(s) for ${DEFAULT_JOIN_EMAIL}`);
        }
      }

      manifest.chatIds = [...new Set(manifest.chatIds)];
      await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
      console.log("");
      console.log(`Manifest written: ${MANIFEST_PATH}`);
    }

    console.log("");
    console.log("Done. Log in with any seed user, e.g.:");
    console.log(`  seed.user1@${SEED_EMAIL_DOMAIN} / ${DEFAULT_PASSWORD}`);
    console.log("");
    console.log("Remove all seed data later:");
    console.log("  npm run db:remove-seed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
