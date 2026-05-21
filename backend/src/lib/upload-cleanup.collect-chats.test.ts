import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

import { collectChatIdsReferencingStorageKey } from "./upload-cleanup.js";

describe("collectChatIdsReferencingStorageKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns chat ids from bundled contentMeta.files", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        chatId: "chat-forward",
        contentMeta: {
          files: [
            {
              filename: "33c50c9a-cd04-436e-817f-8980eaafca6b.pdf",
              url: "/api/v1/files/33c50c9a-cd04-436e-817f-8980eaafca6b.pdf",
            },
          ],
        },
      },
    ]);

    const ids = await collectChatIdsReferencingStorageKey("33c50c9a-cd04-436e-817f-8980eaafca6b.pdf");
    expect(ids).toEqual(["chat-forward"]);
  });

  it("dedupes chat ids", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        chatId: "chat-a",
        contentMeta: { filename: "x.pdf", url: "/api/v1/files/x.pdf" },
      },
      {
        chatId: "chat-a",
        contentMeta: { filename: "x.pdf" },
      },
    ]);

    const ids = await collectChatIdsReferencingStorageKey("x.pdf");
    expect(ids).toEqual(["chat-a"]);
  });
});
