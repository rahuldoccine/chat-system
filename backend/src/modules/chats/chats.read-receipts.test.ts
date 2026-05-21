import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  userSettings: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  message: { findMany: vi.fn() },
  receipt: { findMany: vi.fn() },
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../../lib/chat-access.js", () => ({
  requireActiveMember: vi.fn(),
}));

import { userSharesReadReceipts } from "./chats.service.js";

describe("read receipt privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userSharesReadReceipts defaults to true when settings row missing", async () => {
    prismaMock.userSettings.findUnique.mockResolvedValue(null);
    await expect(userSharesReadReceipts(prismaMock as never, "user-a")).resolves.toBe(true);
  });

  it("userSharesReadReceipts returns false when disabled", async () => {
    prismaMock.userSettings.findUnique.mockResolvedValue({ showReadReceipts: false });
    await expect(userSharesReadReceipts(prismaMock as never, "demo-one")).resolves.toBe(false);
  });
});
