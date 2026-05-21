import { describe, expect, it } from "vitest";

import { deriveMessageReceiptStatus } from "./receipt-status.js";

describe("deriveMessageReceiptStatus", () => {
  it("returns sent when not delivered", () => {
    expect(
      deriveMessageReceiptStatus({
        deliveryTotal: 1,
        delivered: 0,
        readableTotal: 1,
        read: 0,
      }),
    ).toBe("sent");
  });

  it("returns delivered when delivered but not read", () => {
    expect(
      deriveMessageReceiptStatus({
        deliveryTotal: 1,
        delivered: 1,
        readableTotal: 1,
        read: 0,
      }),
    ).toBe("delivered");
  });

  it("returns read when delivered and read", () => {
    expect(
      deriveMessageReceiptStatus({
        deliveryTotal: 1,
        delivered: 1,
        readableTotal: 1,
        read: 1,
      }),
    ).toBe("read");
  });

  it("returns delivered when recipient hides read receipts", () => {
    expect(
      deriveMessageReceiptStatus({
        deliveryTotal: 1,
        delivered: 1,
        readableTotal: 0,
        read: 0,
      }),
    ).toBe("delivered");
  });
});
