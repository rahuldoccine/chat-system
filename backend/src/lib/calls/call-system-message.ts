import { type CallKind, type CallStatus } from "@prisma/client";
import {
  formatCallCiphertext,
  mapTerminalStatus,
  type CallContentStatus,
} from "./call-helpers.js";
import { publicMessage } from "../../modules/chats/chats.service.js";
import {
  createSystemMessageWithReceipts,
  findSystemMessageByClientId,
} from "../system-message-persist.js";

export async function createCallSystemMessage(input: {
  chatId: string;
  callId: string;
  initiatorId: string;
  peerId: string;
  kind: CallKind;
  status: CallStatus;
  durationSec: number;
  endReason?: string;
}): Promise<ReturnType<typeof publicMessage> | null> {
  if (!input.chatId) return null;
  const contentStatus: CallContentStatus = mapTerminalStatus(input.status, input.endReason);
  const ciphertext = formatCallCiphertext(input.kind, contentStatus, input.durationSec);
  const contentMeta = {
    call: {
      callId: input.callId,
      kind: input.kind,
      status: contentStatus,
      durationSec: input.durationSec,
      initiatorId: input.initiatorId,
      peerId: input.peerId,
    },
  };

  const clientMessageId = `call-${input.callId}`;

  const existing = await findSystemMessageByClientId(input.chatId, clientMessageId);
  if (existing) {
    return publicMessage(existing, [], "sent", null);
  }

  const message = await createSystemMessageWithReceipts({
    chatId: input.chatId,
    senderId: input.initiatorId,
    clientMessageId,
    ciphertext,
    contentMeta,
  });

  return publicMessage(message, [], "sent", null);
}

export async function createCallTranscriptMessage(input: {
  chatId: string;
  callId: string;
  userId: string;
  lines: Array<{ t: number; speaker: string; text: string }>;
}): Promise<ReturnType<typeof publicMessage> | null> {
  if (!input.chatId || !input.lines.length) return null;
  const clientMessageId = `call-transcript-${input.callId}-${input.userId}`;
  const existing = await findSystemMessageByClientId(input.chatId, clientMessageId);
  if (existing) {
    return publicMessage(existing, [], "sent", null);
  }

  const bodyText = input.lines.map((l) => l.text).join("\n");
  const ciphertext =
    bodyText.length > 200 ? `${bodyText.slice(0, 197).trim()}…` : bodyText || "Call transcript";
  const contentMeta = {
    callTranscript: {
      callId: input.callId,
      lineCount: input.lines.length,
      lines: input.lines,
    },
  };

  const message = await createSystemMessageWithReceipts({
    chatId: input.chatId,
    senderId: input.userId,
    clientMessageId,
    ciphertext,
    contentMeta,
  });

  return publicMessage(message, [], "sent", null);
}
