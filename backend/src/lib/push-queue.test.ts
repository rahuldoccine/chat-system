import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, resetConfigCache } from "../config/index.js";
import * as devicesService from "../modules/devices/devices.service.js";

import * as fcm from "./fcm.js";
import { enqueuePushNotification, waitForPushQueueIdle } from "./push-queue.js";

const findMany = vi.fn();
const updateMany = vi.fn().mockResolvedValue({ count: 1 });

vi.mock("./prisma.js", () => ({
  getPrisma: () => ({
    deviceToken: { findMany, updateMany },
  }),
}));

vi.mock("./fcm.js", () => ({
  FcmTokenInvalidError: class FcmTokenInvalidError extends Error {
    constructor(message?: string) {
      super(message ?? "invalid");
      this.name = "FcmTokenInvalidError";
    }
  },
  sendFcmDataMessage: vi.fn(),
}));

vi.mock("../modules/devices/devices.service.js", () => ({
  markDeviceTokenRevokedByFcm: vi.fn().mockResolvedValue(undefined),
}));

describe("push queue + FCM revoke", () => {
  beforeEach(() => {
    resetConfigCache();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/mernchat_test");
    vi.stubEnv("JWT_ACCESS_SECRET", "unit-test-jwt-access-secret-16+");
    vi.stubEnv("JWT_REFRESH_SECRET", "unit-test-jwt-refresh-secret-16+");
    vi.stubEnv("FCM_PROJECT_ID", "test-project");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_PATH", "./placeholder-fcm.json");
    loadConfig();
    findMany.mockResolvedValue([{ token: "bad-token" }]);
    vi.mocked(fcm.sendFcmDataMessage).mockRejectedValue(new fcm.FcmTokenInvalidError("messaging/invalid-registration-token"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigCache();
    vi.clearAllMocks();
  });

  it("revokes device token when FCM reports invalid token", async () => {
    enqueuePushNotification({ userId: "u1", chatId: "c1", messageId: "m1" });
    await waitForPushQueueIdle();
    expect(devicesService.markDeviceTokenRevokedByFcm).toHaveBeenCalledWith("bad-token");
  });
});
