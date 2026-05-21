import { describe, expect, it } from "vitest";

import { hashOpaqueToken, newOpaqueToken } from "./opaque-token.js";

describe("opaque-token", () => {
  it("hashOpaqueToken is deterministic", () => {
    const h = hashOpaqueToken("raw", "secret");
    expect(h).toBe(hashOpaqueToken("raw", "secret"));
    expect(h).not.toBe(hashOpaqueToken("raw2", "secret"));
  });

  it("newOpaqueToken produces distinct values", () => {
    expect(newOpaqueToken()).not.toBe(newOpaqueToken());
  });
});
