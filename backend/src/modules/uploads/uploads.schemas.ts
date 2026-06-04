import { z } from "zod";

function optionalUuid(val: unknown): string | undefined {
  if (val === undefined || val === null || val === "") {
    return undefined;
  }
  if (typeof val !== "string") {
    return undefined;
  }
  const r = z.string().uuid().safeParse(val);
  return r.success ? r.data : undefined;
}

function parseVoiceNote(val: unknown): boolean {
  if (val === true || val === "true" || val === "1") {
    return true;
  }
  return false;
}

function parseE2eeEncrypted(val: unknown): boolean {
  return val === true || val === "true" || val === "1";
}

function optionalMime(val: unknown): string | undefined {
  if (typeof val !== "string" || !val.trim()) return undefined;
  const m = val.toLowerCase().split(";")[0]?.trim() ?? "";
  return m || undefined;
}

/** Multipart text fields parsed by multer into `req.body`. */
export function parseUploadFormFields(body: unknown): {
  chatId?: string;
  voiceNote: boolean;
  e2eeEncrypted: boolean;
  originalMime?: string;
} {
  if (!body || typeof body !== "object") {
    return { voiceNote: false, e2eeEncrypted: false };
  }
  const b = body as Record<string, unknown>;
  return {
    chatId: optionalUuid(b.chatId),
    voiceNote: parseVoiceNote(b.voiceNote),
    e2eeEncrypted: parseE2eeEncrypted(b.e2eeEncrypted),
    originalMime: optionalMime(b.originalMime),
  };
}
