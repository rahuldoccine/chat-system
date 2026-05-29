#!/usr/bin/env node
/**
 * Remove ALL chat data (messages, files/media on disk, chats, receipts, polls, pins, call logs).
 * User accounts, auth sessions, friends, blocks, settings, E2EE keys, and profile photos (logos/) are kept.
 *
 * Chat files live under uploads/groupchats/ and uploads/onetoonechats/ (not the upload root).
 *
 * Usage (from backend/):
 *   CONFIRM=YES npm run db:clear-chats
 *   npm run db:clear-chats -- --dry-run
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

/** Subfolders under UPLOAD_DIR that hold chat attachments (see upload-storage.ts). */
const CHAT_UPLOAD_DIRS = ["groupchats", "onetoonechats"];

const dryRun = process.argv.includes("--dry-run");
const confirmed = process.env.CONFIRM === "YES";

if (!dryRun && !confirmed) {
  console.error(
    [
      "Refusing to run without confirmation.",
      "",
      "This permanently deletes every chat, message, upload, and call log.",
      "User accounts and profile photos (uploads/logos/) are kept.",
      "",
      "Dry run:  npm run db:clear-chats -- --dry-run",
      "Execute:  CONFIRM=YES npm run db:clear-chats",
    ].join("\n"),
  );
  process.exit(1);
}

function resolveUploadDir() {
  const raw = process.env.UPLOAD_DIR ?? "./uploads";
  return path.isAbsolute(raw) ? raw : path.resolve(backendRoot, raw);
}

/** Prisma filter: chat/media uploads only (not profile logos). */
const chatUploadWhere = {
  OR: [
    { chatId: { not: null } },
    { storageKey: { startsWith: "groupchats/" } },
    { storageKey: { startsWith: "onetoonechats/" } },
  ],
};

async function countAll(prisma) {
  const [
    users,
    chats,
    messages,
    receipts,
    reactions,
    polls,
    pollVotes,
    pinned,
    uploads,
    callLogs,
    reports,
    chatMembers,
    logoUploads,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.chat.count(),
    prisma.message.count(),
    prisma.receipt.count(),
    prisma.reaction.count(),
    prisma.poll.count(),
    prisma.pollVote.count(),
    prisma.pinnedMessage.count(),
    prisma.uploadedFile.count({ where: chatUploadWhere }),
    prisma.callLog.count(),
    prisma.report.count(),
    prisma.chatMember.count(),
    prisma.uploadedFile.count({ where: { storageKey: { startsWith: "logos/" } } }),
  ]);

  return {
    users,
    chats,
    messages,
    receipts,
    reactions,
    polls,
    pollVotes,
    pinned,
    uploads,
    callLogs,
    reports,
    chatMembers,
    logoUploadsKept: logoUploads,
  };
}

/** Recursively list files under a directory (skips .gitkeep). */
async function walkFiles(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (!entry.isFile() || entry.name === ".gitkeep") continue;
    files.push(fullPath);
  }
  return files;
}

/** Legacy flat files directly in the upload root (pre-category layout). */
async function listLegacyRootUploadFiles(uploadDir) {
  let entries = [];
  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ".gitkeep") continue;
    files.push(path.join(uploadDir, entry.name));
  }
  return files;
}

/** All chat media files on disk (groupchats/, onetoonechats/, legacy root files). */
async function listChatUploadFilesOnDisk(uploadDir) {
  const files = [];
  for (const subdir of CHAT_UPLOAD_DIRS) {
    files.push(...(await walkFiles(path.join(uploadDir, subdir))));
  }
  files.push(...(await listLegacyRootUploadFiles(uploadDir)));
  return files;
}

async function wipeChatUploadFilesOnDisk(uploadDir) {
  const files = await listChatUploadFilesOnDisk(uploadDir);
  if (dryRun) {
    console.log(`[dry-run] Would delete ${files.length} chat file(s) under ${uploadDir}`);
    for (const subdir of CHAT_UPLOAD_DIRS) {
      console.log(`  - ${path.join(uploadDir, subdir)}/`);
    }
    return files.length;
  }

  await fs.mkdir(uploadDir, { recursive: true });
  let removed = 0;
  for (const filePath of files) {
    await fs.unlink(filePath).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
    removed += 1;
  }
  return removed;
}

async function clearDatabase(prisma) {
  if (dryRun) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const deleted = {};

    deleted.reports = (await tx.report.deleteMany()).count;
    deleted.pollVotes = (await tx.pollVote.deleteMany()).count;
    deleted.polls = (await tx.poll.deleteMany()).count;
    deleted.pinnedMessages = (await tx.pinnedMessage.deleteMany()).count;
    deleted.receipts = (await tx.receipt.deleteMany()).count;
    deleted.reactions = (await tx.reaction.deleteMany()).count;
    deleted.messages = (await tx.message.deleteMany()).count;
    deleted.uploadedFiles = (await tx.uploadedFile.deleteMany({ where: chatUploadWhere })).count;
    deleted.callLogs = (await tx.callLog.deleteMany()).count;
    deleted.chatMembers = (await tx.chatMember.deleteMany()).count;
    deleted.chats = (await tx.chat.deleteMany()).count;

    await tx.user.updateMany({
      data: { isOnline: false, lastSeenAt: null },
    });

    return deleted;
  });
}

const prisma = new PrismaClient();

try {
  const uploadDir = resolveUploadDir();
  console.log(dryRun ? "=== DRY RUN ===" : "=== CLEAR ALL CHAT DATA ===");
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@") ?? "(DATABASE_URL not set)"}`);
  console.log(`Upload dir: ${uploadDir}`);
  console.log(`Chat media dirs: ${CHAT_UPLOAD_DIRS.map((d) => path.join(uploadDir, d)).join(", ")}`);
  console.log(`Profile logos kept: ${path.join(uploadDir, "logos")}/\n`);

  const before = await countAll(prisma);
  console.log("Before:");
  console.table(before);

  const diskFiles = await listChatUploadFilesOnDisk(uploadDir);
  console.log(`\nChat files on disk: ${diskFiles.length}`);

  const deleted = await clearDatabase(prisma);
  const diskRemoved = await wipeChatUploadFilesOnDisk(uploadDir);

  const after = await countAll(prisma);
  console.log("\nAfter:");
  console.table(after);

  if (dryRun) {
    console.log("\nNo changes made (dry run).");
  } else {
    console.log("\nDeleted rows:");
    console.table(deleted);
    console.log(`Removed ${diskRemoved} chat file(s) from disk (logos/ untouched).`);
    console.log(`\nKept ${after.users} user account(s), ${after.logoUploadsKept} profile logo upload(s).`);
  }
} catch (err) {
  console.error("Clear failed:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
