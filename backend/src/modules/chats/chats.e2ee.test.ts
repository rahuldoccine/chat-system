import type { MessageKind } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createMessage } from "./chats.service.js";

vi.mock("../../lib/chat-access.js", () => ({
  requireActiveMember: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/notification-router.js", () => ({
  notifyNewMessage: vi.fn().mockResolvedValue(undefined),
}));

const prisma = {
  chat: {
    findUnique: vi.fn().mockResolvedValue({ type: "DIRECT", e2eeMode: "DM_V1" }),
  },
  message: {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  chatMember: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  receipt: {
    createMany: vi.fn().mockResolvedValue(undefined),
  },
  $transaction: vi.fn(),
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prisma,
}));

describe("E2EE DM invariants", () => {
  it("rejects missing ciphertext for DM_V1 direct chats", async () => {
    type Tx = {
      message: { create: (args: unknown) => Promise<unknown> };
      receipt: { createMany: (args: unknown) => Promise<unknown> };
      chat: { update: (args: unknown) => Promise<unknown> };
    };
    const tx: Tx = {
      message: { create: vi.fn().mockResolvedValue({}) },
      receipt: { createMany: vi.fn().mockResolvedValue({}) },
      chat: { update: vi.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: Tx) => Promise<unknown>) => fn(tx));

    await expect(
      createMessage("u1", "c1", {
        clientMessageId: "m1",
        kind: "TEXT" as MessageKind,
        ciphertext: null,
        contentMeta: { e2eeVersion: "v1" },
      }),
    ).rejects.toMatchObject({ code: "E2EE_REQUIRED" });
  });

  it("rejects missing contentMeta.e2eeVersion for DM_V1 direct chats", async () => {
    type Tx = {
      message: { create: (args: unknown) => Promise<unknown> };
      receipt: { createMany: (args: unknown) => Promise<unknown> };
      chat: { update: (args: unknown) => Promise<unknown> };
    };
    const tx: Tx = {
      message: { create: vi.fn().mockResolvedValue({}) },
      receipt: { createMany: vi.fn().mockResolvedValue({}) },
      chat: { update: vi.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: Tx) => Promise<unknown>) => fn(tx));

    await expect(
      createMessage("u1", "c1", {
        clientMessageId: "m2",
        kind: "TEXT" as MessageKind,
        ciphertext: "ciphertext",
        contentMeta: {},
      }),
    ).rejects.toMatchObject({ code: "E2EE_META_INVALID" });
  });
});

