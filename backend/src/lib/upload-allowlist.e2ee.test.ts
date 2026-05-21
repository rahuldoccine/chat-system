import { describe, expect, it } from "vitest";

import { inferUploadKind } from "./upload-allowlist.js";

describe("inferUploadKind (E2EE voice)", () => {
  it("treats application/octet-stream as VOICE when voiceNote is true", () => {
    expect(inferUploadKind("application/octet-stream", { voiceNote: true })).toBe("VOICE");
  });
});

