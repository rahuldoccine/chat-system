import { z } from "zod";

import { createMessageBodySchema } from "../modules/chats/chats.schemas.js";

export const chatSubscribeSchema = z.object({
  chatId: z.string().uuid(),
});

export const messageSendSocketSchema = createMessageBodySchema.extend({
  chatId: z.string().uuid(),
});

export const receiptBatchSchema = z.object({
  chatId: z.string().uuid(),
  messageIds: z.array(z.string().uuid()).max(200),
});

export const readChatSchema = z.object({
  chatId: z.string().uuid(),
});

export const syncHelloSchema = z.object({
  chats: z
    .array(
      z.object({
        chatId: z.string().uuid(),
        lastMessageId: z.string().uuid().optional().nullable(),
      }),
    )
    .max(50),
});

export const typingSchema = z.object({
  chatId: z.string().uuid(),
});

export const presenceUpdateSchema = z.object({
  status: z.enum(["online", "away", "busy"]),
  lastSeenAt: z.coerce.date().optional().nullable(),
});

/** Client reports tab visibility + open chat so push is not suppressed when on home or another browser tab. */
export const notificationContextSchema = z.object({
  tabVisible: z.boolean(),
  activeChatId: z.string().uuid().nullable(),
});

// --- Sprint 9: calling/signaling ---

export const callOfferSchema = z.object({
  callId: z.string().uuid().optional(),
  chatId: z.string().uuid(),
  peerUserId: z.string().uuid(),
  sdp: z.string().min(1),
  deviceId: z.string().min(1).max(200),
  /** `video` = requested call type (VIDEO vs AUDIO), not whether a camera track is active. */
  media: z.object({
    audio: z.boolean(),
    video: z.boolean().default(false),
  }),
  /** True when caller requested video but has no camera (client-side fallback). */
  videoFallback: z.boolean().optional(),
});

export const callAnswerSchema = z.object({
  callId: z.string().uuid(),
  sdp: z.string().min(1),
  deviceId: z.string().min(1).max(200),
});

export const callEndSchema = z.object({
  callId: z.string().uuid(),
  reason: z.string().min(1).max(120).optional(),
});

export const callIceSchema = z.object({
  callId: z.string().uuid(),
  candidate: z.string().min(1),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().min(0).optional(),
});

export const callSignalSchema = z.object({
  callId: z.string().uuid(),
  signal: z.enum(["mute", "unmute", "camera_on", "camera_off"]),
});

/** Live caption line relayed to the other call participant. */
export const callTranscriptLineSchema = z.object({
  callId: z.string().uuid(),
  text: z.string().min(1).max(2000),
  t: z.number(),
});

export const callHistoryQuerySchema = z.object({
  chatId: z.string().uuid().optional(),
  filter: z.enum(["all", "missed", "dialed", "received"]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const callTranscriptSchema = z.object({
  transcript: z.array(
    z.object({
      t: z.number(),
      speaker: z.string().min(1).max(32),
      text: z.string().min(1).max(2000),
    }),
  ),
  postToChat: z.boolean().optional(),
});
