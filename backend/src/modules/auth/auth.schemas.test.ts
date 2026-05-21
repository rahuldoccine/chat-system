import { describe, expect, it } from "vitest";

import { registerBodySchema } from "./auth.schemas.js";

describe("registerBodySchema", () => {
  it("accepts a valid email and password", () => {
    const r = registerBodySchema.safeParse({
      email: "User@Example.com",
      password: "correct-horse-battery-staple",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("user@example.com");
    }
  });

  it("rejects short passwords", () => {
    const r = registerBodySchema.safeParse({
      email: "a@b.co",
      password: "short",
    });
    expect(r.success).toBe(false);
  });
});
