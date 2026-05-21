import { describe, expect, it, vi, beforeEach } from "vitest";

import { publishPreKeys } from "./e2ee.service.js";

const signedPreKey = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const oneTimePreKey = {
  createMany: vi.fn(),
};

const deviceKey = {
  findUnique: vi.fn().mockResolvedValue({
    deviceId: "dev-1",
    userId: "u1",
    revokedAt: null,
  }),
};

const prisma = {
  deviceKey,
  $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<void>) => {
    const tx = {
      signedPreKey,
      oneTimePreKey,
    };
    return fn(tx as unknown as typeof prisma);
  }),
};

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => prisma,
}));

describe("publishPreKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const payload = {
    signedPreKey: { keyId: "spk-1", publicKey: "pub", signature: "sig" },
    oneTimePreKeys: [{ keyId: "otpk-1", publicKey: "otpub" }],
  };

  it("creates signed prekey when missing", async () => {
    signedPreKey.findUnique.mockResolvedValueOnce(null);
    signedPreKey.create.mockResolvedValueOnce({});

    await publishPreKeys("u1", "dev-1", payload);

    expect(signedPreKey.create).toHaveBeenCalledOnce();
    expect(signedPreKey.update).not.toHaveBeenCalled();
  });

  it("skips create when same signed prekey already exists", async () => {
    signedPreKey.findUnique.mockResolvedValueOnce({
      keyId: "spk-1",
      publicKey: "pub",
      signature: "sig",
    });

    await publishPreKeys("u1", "dev-1", payload);

    expect(signedPreKey.create).not.toHaveBeenCalled();
    expect(signedPreKey.update).not.toHaveBeenCalled();
  });

  it("updates signed prekey when key id matches but material changed", async () => {
    signedPreKey.findUnique.mockResolvedValueOnce({
      keyId: "spk-1",
      publicKey: "old",
      signature: "old-sig",
    });
    signedPreKey.update.mockResolvedValueOnce({});

    await publishPreKeys("u1", "dev-1", payload);

    expect(signedPreKey.create).not.toHaveBeenCalled();
    expect(signedPreKey.update).toHaveBeenCalledOnce();
  });
});
