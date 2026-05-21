import { describe, expect, it, vi, beforeEach } from "vitest";

import { patchChatE2eeMode } from "./chats.service.js";
import { AppError } from "../../errors/index.js";

vi.mock("../../lib/chat-access.js", () => ({
  requireActiveMember: vi.fn().mockResolvedValue({}),
}));

const prisma = {
  chat: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prisma,
}));

describe("patchChatE2eeMode policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects downgrade to NONE for direct chats", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({ type: "DIRECT" });

    await expect(patchChatE2eeMode("u1", "c1", "NONE")).rejects.toMatchObject({
      code: "E2EE_MANDATORY",
    });
    expect(prisma.chat.update).not.toHaveBeenCalled();
  });

  it("allows idempotent DM_V1", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({ type: "DIRECT" });
    prisma.chat.update.mockResolvedValueOnce({});

    await patchChatE2eeMode("u1", "c1", "DM_V1");
    expect(prisma.chat.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { e2eeMode: "DM_V1" },
    });
  });

  it("rejects non-direct chats", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({ type: "GROUP" });

    await expect(patchChatE2eeMode("u1", "c1", "DM_V1")).rejects.toBeInstanceOf(AppError);
  });
});
