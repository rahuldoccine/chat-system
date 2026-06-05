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

/** Multipart text fields parsed by multer into `req.body`. */
export function parseUploadFormFields(body: unknown): {
  chatId?: string;
  voiceNote: boolean;
} {
  if (!body || typeof body !== "object") {
    return { voiceNote: false };
  }
  const b = body as Record<string, unknown>;
  return {
    chatId: optionalUuid(b.chatId),
    voiceNote: parseVoiceNote(b.voiceNote),
  };
}
