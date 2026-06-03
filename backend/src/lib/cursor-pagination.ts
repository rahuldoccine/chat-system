import { AppError } from "../errors/index.js";

export type MessageCursorPayload = { c: string; i: string };

export function encodeMessageCursor(createdAt: Date, id: string): string {
  const payload: MessageCursorPayload = { c: createdAt.toISOString(), i: id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeMessageCursor(raw: string): MessageCursorPayload {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const data = JSON.parse(json) as MessageCursorPayload;
    if (typeof data?.c !== "string" || typeof data?.i !== "string") {
      throw new TypeError("invalid shape");
    }
    return data;
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Invalid pagination cursor");
  }
}
