import { describe, expect, it, vi } from "vitest";

import { searchMessagesInChat } from "./chats.service.js";

vi.mock("../../lib/chat-access.js", () => ({
  requireActiveMember: vi.fn().mockResolvedValue({}),
}));

const prisma = {
  chat: {
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prisma,
}));

describe("searchMessagesInChat", () => {
  it("returns searchUnavailable for E2EE DMs", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({ type: "DIRECT", e2eeMode: "DM_V1" });

    const out = await searchMessagesInChat("u1", "c1", "hello", { limit: 20 });

    expect(out.data).toEqual([]);
    expect(out.searchUnavailable).toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("queries messages for non-E2EE chats", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({ type: "GROUP", e2eeMode: "NONE" });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: "m1",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        ciphertext: "hello world",
        sender_id: "u1",
        sender_email: "a@b.com",
        sender_displayName: "A",
        sender_avatarUrl: null,
        sender_username: null,
      },
    ]);

    const out = await searchMessagesInChat("u1", "c1", "world", { limit: 20 });

    expect(out.searchUnavailable).toBeUndefined();
    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.messageId).toBe("m1");
    expect(out.data[0]?.snippet).toContain("world");
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
