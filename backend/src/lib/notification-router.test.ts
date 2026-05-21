import { afterEach, describe, expect, it, vi } from "vitest";

import { resetConfigCache } from "../config/index.js";
import * as notificationContextMemory from "../sockets/notification-context-memory.js";

import * as pushQueue from "./push-queue.js";
import * as notificationContextRedis from "./notification-context-redis.js";
import { notifyNewMessage } from "./notification-router.js";

const findMany = vi.fn();

vi.mock("./prisma.js", () => ({
  getPrisma: () => ({
    chatMember: { findMany },
  }),
}));

vi.mock("./notification-context-redis.js", () => ({
  isActivelyViewingChatRedis: vi.fn().mockResolvedValue(null),
}));

vi.mock("../modules/users/users.service.js", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({ notifyPush: true }),
}));

vi.mock("./push-queue.js", () => ({
  enqueuePushNotification: vi.fn().mockReturnValue(true),
}));

vi.mock("./push-notification-content.js", () => ({
  resolvePushNotificationContent: vi.fn().mockResolvedValue({
    title: "Rahul Doccine",
    body: "hi",
  }),
}));

const baseMessage = {
  id: "m1",
  chatId: "c1",
  senderId: "u1",
  clientMessageId: "cli",
  kind: "TEXT",
  ciphertext: null,
  contentMeta: null,
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

describe("notifyNewMessage", () => {
  afterEach(() => {
    resetConfigCache();
    vi.clearAllMocks();
    notificationContextMemory.clearNotificationContext("u2");
  });

  it("enqueues when not muted, push on, not viewing chat", async () => {
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: null,
        user: { userSettings: { notifyPush: true } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).toHaveBeenCalledWith({
      userId: "u2",
      chatId: "c1",
      messageId: "m1",
      title: "Rahul Doccine",
      body: "hi",
    });
  });

  it("does not enqueue when muted", async () => {
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: new Date(Date.now() + 60_000),
        user: { userSettings: { notifyPush: true } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).not.toHaveBeenCalled();
  });

  it("does not enqueue when actively viewing the same chat", async () => {
    notificationContextMemory.setNotificationContext("u2", true, "c1");
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: null,
        user: { userSettings: { notifyPush: true } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).not.toHaveBeenCalled();
  });

  it("enqueues when socket connected but tab hidden (other browser tab active)", async () => {
    notificationContextMemory.setNotificationContext("u2", false, null);
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: null,
        user: { userSettings: { notifyPush: true } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).toHaveBeenCalled();
  });

  it("enqueues when on home screen (no active chat) with visible tab", async () => {
    notificationContextMemory.setNotificationContext("u2", true, null);
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: null,
        user: { userSettings: { notifyPush: true } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).toHaveBeenCalled();
  });

  it("does not enqueue when notifyPush is false", async () => {
    findMany.mockResolvedValue([
      {
        userId: "u2",
        mutedUntil: null,
        user: { userSettings: { notifyPush: false } },
      },
    ]);
    await notifyNewMessage({ senderId: "u1", chatId: "c1", message: baseMessage });
    expect(pushQueue.enqueuePushNotification).not.toHaveBeenCalled();
  });
});
