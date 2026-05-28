import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getPrisma } from "./prisma.js";
import { safeExtensionForMime } from "./upload-allowlist.js";

export const UPLOAD_CATEGORIES = ["logos", "onetoonechats", "groupchats"] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

/** Relative path under upload root, e.g. `logos/uuid.jpg` or legacy `uuid.jpg`. */
export function isSafeStorageKey(storageKey: string): boolean {
  if (!storageKey || storageKey.includes("..")) return false;
  const normalized = storageKey.replace(/\\/g, "/");
  if (!normalized.includes("/")) {
    const base = path.basename(normalized);
    return base === normalized && base.length > 0 && !base.startsWith(".");
  }
  const parts = normalized.split("/");
  if (parts.length !== 2) return false;
  const [category, filename] = parts;
  if (!UPLOAD_CATEGORIES.includes(category as UploadCategory)) return false;
  return filename === path.basename(filename) && filename.length > 0 && !filename.startsWith(".");
}

export function storageKeyFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/\/files\/([^?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function resolveStorageAbsolutePath(uploadDir: string, storageKey: string): string | null {
  if (!isSafeStorageKey(storageKey)) return null;
  const root = path.resolve(uploadDir);
  const abs = path.resolve(root, storageKey);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function resolveUploadCategory(chatId?: string): Promise<UploadCategory> {
  if (!chatId) return "logos";
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true },
  });
  if (!chat) return "logos";
  return chat.type === "GROUP" ? "groupchats" : "onetoonechats";
}

export function buildStorageKey(category: UploadCategory, mime: string, originalName?: string): string {
  const ext =
    safeExtensionForMime(mime) ||
    (originalName ? path.extname(originalName).slice(0, 8).toLowerCase() : "") ||
    "";
  const safeExt = ext && /^\.[a-z0-9]+$/i.test(ext) ? ext : "";
  return `${category}/${randomUUID()}${safeExt}`;
}

export function fileDownloadPath(storageKey: string): string {
  return `/api/v1/files/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

export async function ensureCategoryDir(uploadDir: string, category: UploadCategory): Promise<string> {
  const dir = path.join(uploadDir, category);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function placeUploadedFile(
  uploadDir: string,
  tempFilename: string,
  category: UploadCategory,
  mime: string,
  originalName?: string,
): Promise<{ storageKey: string; absolutePath: string }> {
  const storageKey = buildStorageKey(category, mime, originalName);
  const categoryDir = await ensureCategoryDir(uploadDir, category);
  const destPath = path.join(categoryDir, path.basename(storageKey));
  const tempPath = path.join(uploadDir, tempFilename);
  await fs.rename(tempPath, destPath).catch(async () => {
    await fs.copyFile(tempPath, destPath);
    await fs.unlink(tempPath).catch(() => {});
  });
  return { storageKey, absolutePath: destPath };
}
