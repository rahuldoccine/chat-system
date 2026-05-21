import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadedFile } from "@prisma/client";

const { prismaMock, collectChatIdsMock } = vi.hoisted(() => ({
  prismaMock: {
    chatMember: { findFirst: vi.fn() },
  },
  collectChatIdsMock: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("./upload-cleanup.js", () => ({
  collectChatIdsReferencingStorageKey: collectChatIdsMock,
}));

import { userCanAccessUploadedFile } from "./upload-access.js";

describe("upload-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectChatIdsMock.mockResolvedValue([]);
  });

  it("allows uploader regardless of chat membership", async () => {
    const file = {
      id: "f1",
      userId: "uploader",
      chatId: "chat-a",
      storageKey: "doc.pdf",
    } as UploadedFile;

    await expect(userCanAccessUploadedFile("uploader", file)).resolves.toBe(true);
    expect(prismaMock.chatMember.findFirst).not.toHaveBeenCalled();
  });

  it("allows member of a forwarded chat that references the file", async () => {
    const file = {
      id: "f1",
      userId: "uploader",
      chatId: "chat-original",
      storageKey: "doc.pdf",
    } as UploadedFile;

    collectChatIdsMock.mockResolvedValue(["chat-forward"]);

    prismaMock.chatMember.findFirst.mockResolvedValue({ id: "m1" });

    await expect(userCanAccessUploadedFile("demo-two", file)).resolves.toBe(true);

    expect(prismaMock.chatMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "demo-two",
        leftAt: null,
        chatId: { in: expect.arrayContaining(["chat-original", "chat-forward"]) },
      },
    });
  });

  it("denies user not in any referencing chat", async () => {
    const file = {
      id: "f1",
      userId: "uploader",
      chatId: "chat-original",
      storageKey: "doc.pdf",
    } as UploadedFile;

    collectChatIdsMock.mockResolvedValue([]);
    prismaMock.chatMember.findFirst.mockResolvedValue(null);

    await expect(userCanAccessUploadedFile("stranger", file)).resolves.toBe(false);
  });
});
