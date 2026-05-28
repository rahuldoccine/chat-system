import path from "node:path";

import { fileDownloadPath, storageKeyFromUrl } from "./upload-storage.js";

const LOGO_PREFIX = "logos";

/**
 * Persist only the file name (or `logos/<file>` legacy) in the database.
 * Strips host, /api/v1/files/, and query strings.
 */
export function normalizeAvatarDbValue(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const key = storageKeyFromUrl(trimmed);
    return key ? path.basename(key.replace(/\\/g, "/")) : null;
  }

  if (trimmed.includes("/files/")) {
    const key = storageKeyFromUrl(
      trimmed.startsWith("http") ? trimmed : `http://local${trimmed.startsWith("/") ? "" : "/"}${trimmed}`,
    );
    if (key) return path.basename(key.replace(/\\/g, "/"));
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith(`${LOGO_PREFIX}/`)) {
    return path.basename(normalized);
  }
  if (normalized.includes("/")) {
    return path.basename(normalized);
  }

  const base = path.basename(normalized);
  if (!base || base === "." || base.startsWith("..")) return null;
  return base;
}

/** Resolve DB file name to API path served by GET /api/v1/files/... */
export function expandAvatarUrl(dbValue: string | null | undefined): string | null {
  const fileName = normalizeAvatarDbValue(dbValue);
  if (!fileName) return null;
  const storageKey = `${LOGO_PREFIX}/${fileName}`;
  return fileDownloadPath(storageKey);
}

/** Map upload storage key (e.g. logos/uuid.jpg) to DB file name. */
export function avatarFileNameFromStorageKey(storageKey: string): string {
  return path.basename(storageKey.replace(/\\/g, "/"));
}

/** Resolve DB or URL value to on-disk storage key for cleanup / access checks. */
export function resolveLogoStorageKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const fromUrl = storageKeyFromUrl(value);
  if (fromUrl) return fromUrl.replace(/\\/g, "/");
  const fileName = normalizeAvatarDbValue(value);
  if (!fileName) return null;
  return `${LOGO_PREFIX}/${fileName}`;
}
