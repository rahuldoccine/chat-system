import { describe, expect, it } from "vitest";

import { shouldSendPush } from "./notification-policy.js";

describe("shouldSendPush", () => {
  it("returns false when notifyPush is false", () => {
    expect(
      shouldSendPush({
        notifyPush: false,
        mutedUntil: null,
        isActivelyViewingChat: false,
      }),
    ).toBe(false);
  });

  it("returns false when mutedUntil is in the future", () => {
    expect(
      shouldSendPush({
        notifyPush: true,
        mutedUntil: new Date(Date.now() + 60_000),
        isActivelyViewingChat: false,
      }),
    ).toBe(false);
  });

  it("returns false when actively viewing the chat with visible tab", () => {
    expect(
      shouldSendPush({
        notifyPush: true,
        mutedUntil: null,
        isActivelyViewingChat: true,
      }),
    ).toBe(false);
  });

  it("returns true when push on, not muted, not actively viewing", () => {
    expect(
      shouldSendPush({
        notifyPush: true,
        mutedUntil: null,
        isActivelyViewingChat: false,
      }),
    ).toBe(true);
  });

  it("returns true when mutedUntil is in the past", () => {
    expect(
      shouldSendPush({
        notifyPush: true,
        mutedUntil: new Date(Date.now() - 60_000),
        isActivelyViewingChat: false,
      }),
    ).toBe(true);
  });
});
