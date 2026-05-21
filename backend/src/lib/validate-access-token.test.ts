import { describe, expect, it, vi, beforeEach } from "vitest";

import { loadConfig, resetConfigCache } from "../config/index.js";
import { signAccessToken } from "./jwt.js";
import { verifyAccessTokenActive } from "./validate-access-token.js";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("./prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

describe("verifyAccessTokenActive", () => {
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_ACCESS_SECRET: "test-access-secret-16ch",
    JWT_REFRESH_SECRET: "test-refresh-secret-16ch",
  });

  beforeEach(() => {
    resetConfigCache();
    vi.clearAllMocks();
  });

  it("rejects token when authVersion does not match user", async () => {
    const token = signAccessToken({ sub: "user-1", authVer: 0 }, config);
    prismaMock.user.findUnique.mockResolvedValue({ authVersion: 1 });

    await expect(verifyAccessTokenActive(token, config)).rejects.toThrow("Session revoked");
  });

  it("accepts token when authVersion matches user", async () => {
    const token = signAccessToken({ sub: "user-1", authVer: 2 }, config);
    prismaMock.user.findUnique.mockResolvedValue({ authVersion: 2 });

    const payload = await verifyAccessTokenActive(token, config);
    expect(payload.sub).toBe("user-1");
  });
});
