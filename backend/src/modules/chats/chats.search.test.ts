import { describe, expect, it, vi } from "vitest";

import { searchMessagesInChat } from "./chats.service.js";

vi.mock("../../lib/chat-access.js", () => ({
  requireActiveMember: vi.fn().mockResolvedValue({}),
}));

const prisma = {
  $queryRaw: vi.fn(),
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prisma,
}));

describe("searchMessagesInChat", () => {
  it("queries messages and returns snippets", async () => {
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

    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.messageId).toBe("m1");
    expect(out.data[0]?.snippet).toContain("world");
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
